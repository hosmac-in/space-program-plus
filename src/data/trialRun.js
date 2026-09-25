// THE TRIAL PROGRAM — sp_trial_run, one recorded Test run per building.
//
// `answers` is useTestRun.jsx's shape, stored as it is held:
//   { gates: { [group id]: { yes } }, questions: { [question id]: { x } },
//     general: { [id]: value } }
// keyed by the instance ids the questionnaire is, so it reads against the
// definition as it stands — an answer to a question since removed is a dangling
// key, never read, exactly as the questionnaire's own are.
//
// NOT sp_questionnaire: that row is the form, and saving an answer must never
// move its version or rewrite it.

import { supabase } from './supabase.js'

const EMPTY = { gates: {}, questions: {}, general: {} }

// Every key filled in, so a row written by hand with one missing still loads.
export function normaliseAnswers(answers) {
  return {
    gates: answers?.gates ?? {},
    questions: answers?.questions ?? {},
    general: answers?.general ?? {},
  }
}

// The building's recorded run: { id, answers, version }, or an empty one with
// no id when nothing has been saved yet. Throws on a failed read — "could not
// ask" must never look like "nothing recorded", or the next save writes an empty
// run over a real one.
export async function readTrialRun(buildingId) {
  const { data, error } = await supabase
    .from('sp_trial_run')
    .select('id, answers, version')
    .eq('building_id', buildingId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { id: null, answers: EMPTY, version: null }
  return { id: data.id, answers: normaliseAnswers(data.answers), version: data.version }
}

// The first save INSERTS; every later one is conditional on the version it was
// read at. Returns { error, id, version }.
export async function writeTrialRun({ id, buildingId, answers, atVersion }) {
  if (!id) {
    const { data, error } = await supabase
      .from('sp_trial_run')
      .insert({ building_id: buildingId, answers })
      .select('id, version')
    if (error) return { error: error.message, id: null, version: null }
    if (!data || data.length === 0) return { error: 'not saved — are you an admin?', id: null, version: null }
    return { error: null, id: data[0].id, version: data[0].version }
  }

  const { data, error } = await supabase
    .from('sp_trial_run')
    .update({ answers, version: atVersion + 1, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('version', atVersion)
    .select('id, version')
  if (error) return { error: error.message, id, version: null }
  // Zero rows: the row moved on, or RLS refused a non-admin. Nothing was written.
  if (!data || data.length === 0) {
    return { error: 'this trial was saved somewhere else, or you are not an admin — reload first', id, version: null }
  }
  return { error: null, id, version: data[0].version }
}
