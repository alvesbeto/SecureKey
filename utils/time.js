let timeSensor = null

function getTimeSensor() {
  if (!timeSensor && typeof hmSensor !== 'undefined') {
    try {
      timeSensor = hmSensor.createSensor(hmSensor.id.TIME)
    } catch (err) {
      timeSensor = null
    }
  }
  return timeSensor
}

export function getWatchUtcMs() {
  const sensor = getTimeSensor()
  if (sensor && typeof sensor.utc === 'number' && sensor.utc > 1000000000000) {
    return sensor.utc
  }
  return Date.now()
}

export function getWatchClockHHMM() {
  const sensor = getTimeSensor()
  if (sensor && typeof sensor.hour === 'number' && typeof sensor.minute === 'number') {
    const hh = String(sensor.hour).padStart(2, '0')
    const mm = String(sensor.minute).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
