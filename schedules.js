// schedules.js
//
// Hardcoded schedule templates for the Immersion Engine MVP.
// Each template maps every day of the week to an array of time slots.
// A slot defines: { start, end, activity, location }
// Times are in 24h "HH:MM" format and are interpreted in the LOCAL
// timezone of the machine running SillyTavern (Date object local time).
//
// NOTE: Per the spec (section 4.1), location is independent of activity
// but normally follows it. All templates below define both explicitly.

export const SCHEDULE_TEMPLATES = {
  officeWorker: {
    label: 'Office Worker',
    // Same schedule applied to every weekday; weekends are lighter.
    week: {
      monday:    officeWeekday(),
      tuesday:   officeWeekday(),
      wednesday: officeWeekday(),
      thursday:  officeWeekday(),
      friday:    officeWeekday(),
      saturday:  officeWeekend(),
      sunday:    officeWeekend(),
    },
  },

  universityStudent: {
    label: 'University Student',
    week: {
      monday:    studentWeekday(),
      tuesday:   studentWeekday(),
      wednesday: studentWeekday(),
      thursday:  studentWeekday(),
      friday:    studentWeekday(),
      saturday:  studentWeekend(),
      sunday:    studentWeekend(),
    },
  },

  streamer: {
    label: 'Streamer',
    // Streamers often keep late/inverted hours. Same schedule every day
    // for MVP simplicity.
    week: {
      monday:    streamerDay(),
      tuesday:   streamerDay(),
      wednesday: streamerDay(),
      thursday:  streamerDay(),
      friday:    streamerDay(),
      saturday:  streamerDay(),
      sunday:    streamerDay(),
    },
  },
};

function officeWeekday() {
  return [
    { start: '00:00', end: '07:00', activity: 'Sleeping',  location: 'Home' },
    { start: '07:00', end: '08:00', activity: 'Getting Ready', location: 'Home' },
    { start: '08:00', end: '08:30', activity: 'Commuting', location: 'Commuting' },
    { start: '08:30', end: '17:00', activity: 'Working',   location: 'Office' },
    { start: '17:00', end: '17:30', activity: 'Commuting', location: 'Commuting' },
    { start: '17:30', end: '19:00', activity: 'Exercising', location: 'Gym' },
    { start: '19:00', end: '23:00', activity: 'Relaxing',  location: 'Home' },
    { start: '23:00', end: '24:00', activity: 'Sleeping',  location: 'Home' },
  ];
}

function officeWeekend() {
  return [
    { start: '00:00', end: '09:00', activity: 'Sleeping',  location: 'Home' },
    { start: '09:00', end: '12:00', activity: 'Relaxing',  location: 'Home' },
    { start: '12:00', end: '14:00', activity: 'Running Errands', location: 'Store' },
    { start: '14:00', end: '18:00', activity: 'Socializing', location: 'Cafe' },
    { start: '18:00', end: '23:30', activity: 'Relaxing',  location: 'Home' },
    { start: '23:30', end: '24:00', activity: 'Sleeping',  location: 'Home' },
  ];
}

function studentWeekday() {
  return [
    { start: '00:00', end: '08:00', activity: 'Sleeping',  location: 'Home' },
    { start: '08:00', end: '08:30', activity: 'Getting Ready', location: 'Home' },
    { start: '08:30', end: '12:00', activity: 'Attending Class', location: 'Campus' },
    { start: '12:00', end: '13:00', activity: 'Eating Lunch', location: 'Campus' },
    { start: '13:00', end: '16:00', activity: 'Studying',   location: 'Campus' },
    { start: '16:00', end: '18:00', activity: 'Socializing', location: 'Campus' },
    { start: '18:00', end: '19:00', activity: 'Eating Dinner', location: 'Home' },
    { start: '19:00', end: '23:00', activity: 'Studying',   location: 'Home' },
    { start: '23:00', end: '24:00', activity: 'Sleeping',   location: 'Home' },
  ];
}

function studentWeekend() {
  return [
    { start: '00:00', end: '10:00', activity: 'Sleeping',  location: 'Home' },
    { start: '10:00', end: '13:00', activity: 'Relaxing',  location: 'Home' },
    { start: '13:00', end: '17:00', activity: 'Socializing', location: 'Outdoors' },
    { start: '17:00', end: '24:00', activity: 'Gaming',    location: 'Home' },
  ];
}

function streamerDay() {
  return [
    { start: '00:00', end: '04:00', activity: 'Streaming', location: 'Home' },
    { start: '04:00', end: '12:00', activity: 'Sleeping',  location: 'Home' },
    { start: '12:00', end: '14:00', activity: 'Eating Lunch', location: 'Home' },
    { start: '14:00', end: '17:00', activity: 'Editing Videos', location: 'Home' },
    { start: '17:00', end: '18:00', activity: 'Relaxing', location: 'Home' },
    { start: '18:00', end: '24:00', activity: 'Streaming', location: 'Home' },
  ];
}
