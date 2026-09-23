// FORMULAS — how many of a room one answer buys
// =============================================
//
// A questionnaire asks one number and every room it connects to carries a rule
// over it: `ceil(x/4)`, `2`, `ceil((ipd*0.4+icu)/750)`. This module is the whole
// language — tokeniser, parser, evaluator — and the ONE evaluator in the app.
// The engine that turns answers into an sp_option.data calls this rather than
// writing its own; the documented failure here is always the second copy.
//
//   compileFormula(source, allowedVars) -> a COMPILED rule
//   compiled.evaluate(scope)            -> { value, state, message }
//
//   >>> NEVER new Function AND NEVER eval. The source comes out of a shared
//   >>> jsonb column in a public app: a stored string executed as JS is an
//   >>> injection, and one authored questionnaire would run in every reader's
//   >>> browser. That is the reason this file exists rather than a one-liner.
//
// THE FOUR STATES a rule can be in, because a run that cannot tell them apart is
// a run nobody can debug — four different things landing on one grey zero was
// the first version of this:
//
//   ok           it computed. `value` is the count.
//   unauthored   nobody has written a rule. NOT zero — an unfinished
//                questionnaire must not look finished.
//   invalid      it does not parse, or it computed to nothing real (x/0).
//   unresolved   it names a variable the questionnaire no longer has.
//
// A VALUE IS A WHOLE NUMBER OF ROOMS: clamped to >= 0, then rounded half-up.
// That order matters — half-up is only unambiguous on a non-negative number —
// and an author who wants "always up" writes ceil() and can see that they did.
//
// COMMENTS: `// one per four beds` runs to the end of the line. It is stripped in
// the tokeniser, so it is whitespace to everything after — a name mentioned in
// prose is not a variable and can never make a rule unresolved. A source that is
// NOTHING BUT a comment reads as UNAUTHORED: it is somebody's note about a rule
// they have yet to write, which is the state it was in already.

// Every name this language knows, with its arity. Checked at PARSE time so the
// error carries a position; unchecked arity gives NaN at run time instead, which
// is a wrong count rather than a message.
const FUNCTIONS = {
  ceil: { arity: 1, fn: Math.ceil },
  floor: { arity: 1, fn: Math.floor },
  round: { arity: 1, fn: Math.round },
  abs: { arity: 1, fn: Math.abs },
  min: { arity: null, fn: Math.min },
  max: { arity: null, fn: Math.max },
  clamp: { arity: 3, fn: (v, lo, hi) => Math.min(Math.max(v, lo), hi) },
}

// Reached for and not offered. Named in the message, because "unexpected token"
// sends someone hunting for a typo they did not make.
const NOT_OFFERED = {
  '^': 'there is no ^ — write the multiplication out',
  '%': 'there is no % — divide instead',
  '!': 'there is no !',
  '&': 'there is no &',
  '|': 'there is no |',
}

class FormulaError extends Error {
  constructor(message, at) {
    super(message)
    this.at = at
  }
}

// --- Tokenising ---------------------------------------------------------------

const isDigit = (c) => c >= '0' && c <= '9'
const isNameStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'

// A DOT IS PART OF A NAME, NOT AN OPERATOR. `patient_care.operating_room` is ONE
// name that happens to read as a path — the language has no member access and
// needs none, since the scope is a flat map of whatever names the questionnaire
// put in it. So nothing here parses the two halves and nothing can be wrong
// about what a dot means.
//
// >>> SAFE BESIDE A DECIMAL POINT because a name cannot START with a digit and
// >>> the number branch is tested first: `2.5` is a number, `a.b` is a name, and
// >>> the two can never be read as each other. A trailing `a.` is a name nothing
// >>> is called, which reads as unresolved — visible, and what it is.
export const isNameChar = (c) => isNameStart(c) || isDigit(c) || c === '.'

function tokenise(source) {
  const tokens = []
  let i = 0

  while (i < source.length) {
    const c = source[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1
      continue
    }

    // A COMMENT RUNS TO THE END OF THE LINE, and there is no /* */ — a rule is
    // typed into one box on one line, so the whole of the rest of it is the
    // note and there is nothing for a closing mark to protect.
    //
    // It is whitespace, which is the whole of the feature: it never reaches the
    // parser, so `uses` does not collect a name mentioned in prose and a comment
    // can never make a rule unresolved.
    //
    // >>> `/` IS ALSO DIVISION, so the second character decides. `x//2` is a
    // >>> comment, not a division by a comment — which is why this is tested
    // >>> BEFORE the operator, and why nothing here treats a lone `/` specially.
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }

    if (isDigit(c) || (c === '.' && isDigit(source[i + 1]))) {
      const start = i
      while (i < source.length && isDigit(source[i])) i += 1
      if (source[i] === '.') {
        i += 1
        while (i < source.length && isDigit(source[i])) i += 1
      }
      // A second point is a typo, not a second number: 1.2.3 read as 1.2 then 3
      // would silently become a multiplication nobody wrote.
      if (source[i] === '.') throw new FormulaError('a number cannot have two decimal points', i)
      tokens.push({ kind: 'number', value: Number(source.slice(start, i)), at: start })
      continue
    }

    if (isNameStart(c)) {
      const start = i
      while (i < source.length && isNameChar(source[i])) i += 1
      tokens.push({ kind: 'name', value: source.slice(start, i), at: start })
      continue
    }

    if ('+-*/(),'.includes(c)) {
      tokens.push({ kind: c, at: i })
      i += 1
      continue
    }

    throw new FormulaError(NOT_OFFERED[c] ?? `“${c}” means nothing here`, i)
  }

  tokens.push({ kind: 'end', at: source.length })
  return tokens
}

// --- Parsing ------------------------------------------------------------------
//
// Recursive descent, lowest precedence outermost. The AST is plain objects and
// `uses` collects every variable named, so evaluate can say WHICH name went
// missing rather than reporting the whole rule as broken.

function parse(source, allowedVars) {
  const tokens = tokenise(source)
  const uses = new Set()
  let pos = 0

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function expect(kind, what) {
    if (peek().kind !== kind) throw new FormulaError(`expected ${what}`, peek().at)
    return next()
  }

  function parseExpression() {
    let left = parseTerm()
    while (peek().kind === '+' || peek().kind === '-') {
      const op = next().kind
      left = { type: 'binary', op, left, right: parseTerm() }
    }
    return left
  }

  function parseTerm() {
    let left = parseUnary()
    while (peek().kind === '*' || peek().kind === '/') {
      const token = next()
      left = { type: 'binary', op: token.kind, left, right: parseUnary(), at: token.at }
    }
    return left
  }

  function parseUnary() {
    if (peek().kind === '-') {
      next()
      return { type: 'negate', value: parseUnary() }
    }
    if (peek().kind === '+') {
      next()
      return parseUnary()
    }
    return parsePrimary()
  }

  function parsePrimary() {
    const token = next()

    if (token.kind === 'number') return { type: 'number', value: token.value }

    if (token.kind === '(') {
      const inner = parseExpression()
      expect(')', 'a closing bracket')
      return inner
    }

    if (token.kind === 'name') {
      const name = token.value

      if (peek().kind === '(') {
        const spec = FUNCTIONS[name]
        if (!spec) throw new FormulaError(`there is no function called “${name}”`, token.at)
        next()
        const args = []
        if (peek().kind !== ')') {
          args.push(parseExpression())
          while (peek().kind === ',') {
            next()
            args.push(parseExpression())
          }
        }
        expect(')', 'a closing bracket')
        if (spec.arity === null) {
          if (args.length === 0) throw new FormulaError(`${name}() needs at least one number`, token.at)
        } else if (args.length !== spec.arity) {
          throw new FormulaError(
            `${name}() takes ${spec.arity} number${spec.arity === 1 ? '' : 's'}, not ${args.length}`,
            token.at
          )
        }
        return { type: 'call', name, args }
      }

      if (FUNCTIONS[name]) throw new FormulaError(`${name} is a function — write ${name}(…)`, token.at)
      if (!allowedVars.includes(name)) {
        throw new FormulaError(`nothing here is called “${name}”`, token.at)
      }
      uses.add(name)
      return { type: 'variable', name, at: token.at }
    }

    if (token.kind === 'end') throw new FormulaError('the rule stops early', token.at)
    throw new FormulaError('expected a number', token.at)
  }

  const root = parseExpression()
  if (peek().kind !== 'end') throw new FormulaError('there is more here than one rule', peek().at)
  return { root, uses: [...uses] }
}

// --- Evaluating ---------------------------------------------------------------

function run(node, scope) {
  switch (node.type) {
    case 'number':
      return node.value
    case 'variable':
      return scope[node.name]
    case 'negate':
      return -run(node.value, scope)
    case 'call':
      return FUNCTIONS[node.name].fn(...node.args.map((a) => run(a, scope)))
    default: {
      const left = run(node.left, scope)
      const right = run(node.right, scope)
      if (node.op === '+') return left + right
      if (node.op === '-') return left - right
      if (node.op === '*') return left * right
      // Not guarded: Infinity is caught by the finite check below, with a
      // message that says division rather than "something went wrong".
      return left / right
    }
  }
}

// A COUNT, from whatever the arithmetic produced. Clamp, then round — and `+ 0`
// because ceil(-0.2) is -0, which prints as "0" but fails every comparison
// against it.
function asCount(n) {
  if (!Number.isFinite(n)) return null
  return Math.round(Math.max(0, n)) + 0
}

// --- The one entry point ------------------------------------------------------

// Compiled rules are held by source, because evaluation runs for every
// connection on every render of both columns and a large building has hundreds.
const cache = new Map()

// `allowedVars` is the AUTHORED list — a supporting department's variable names,
// or ['x'] for a question — NOT what currently resolves to something. A variable
// whose department has been deleted from the catalog must still COMPILE, or one
// deletion reads as a syntax error and hides which term actually died.
export function compileFormula(source, allowedVars = ['x']) {
  const text = typeof source === 'string' ? source : ''
  const key = `${allowedVars.join(',')}\u0000${text}`
  const hit = cache.get(key)
  if (hit) return hit

  const compiled = build(text, allowedVars)
  cache.set(key, compiled)
  return compiled
}

// Nothing but a comment — `// ask the client` — is a NOTE, not a rule. Read as
// unauthored rather than as broken: somebody wrote down what they still have to
// work out, which is the same state as not having written anything, and calling
// it an error would put a red mark on every rule still being thought about.
function isAllComment(text) {
  return text.replace(/\/\/[^\n]*/g, '').trim() === ''
}

function build(text, allowedVars) {
  // Blank is UNAUTHORED, which is a different thing from broken: nobody has
  // written a rule here yet, and it must read that way rather than as an error
  // or as a zero.
  if (text.trim() === '' || isAllComment(text)) {
    return {
      source: text,
      authored: false,
      ok: false,
      message: null,
      at: null,
      uses: [],
      evaluate: () => ({ value: 0, state: 'unauthored', message: null }),
    }
  }

  let parsed
  try {
    parsed = parse(text, allowedVars)
  } catch (error) {
    const message = error instanceof FormulaError ? error.message : 'this rule cannot be read'
    const at = error instanceof FormulaError ? error.at : null
    return {
      source: text,
      authored: true,
      ok: false,
      message,
      at,
      uses: [],
      evaluate: () => ({ value: 0, state: 'invalid', message }),
    }
  }

  return {
    source: text,
    authored: true,
    ok: true,
    message: null,
    at: null,
    uses: parsed.uses,
    // `scope` holds a number per variable. A name the scope has no number for is
    // UNRESOLVED — the department it pointed at is gone — and is named in the
    // message, since "this does not work" over four terms is a hunt.
    evaluate: (scope = {}) => {
      const missing = parsed.uses.filter((name) => !Number.isFinite(scope[name]))
      if (missing.length > 0) {
        return {
          value: 0,
          state: 'unresolved',
          message: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in the questionnaire any more`,
        }
      }
      const value = asCount(run(parsed.root, scope))
      if (value === null) {
        return { value: 0, state: 'invalid', message: 'this works out to nothing real — check for a divide by zero' }
      }
      return { value, state: 'ok', message: null }
    },
  }
}

// What the help text under a formula field lists, so the field and this module
// cannot disagree about what the language has.
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS)
