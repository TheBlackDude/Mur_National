import { setGlobalOptions } from 'firebase-functions/v2'
import { initializeApp } from 'firebase-admin/app'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 50, enforceAppCheck: true })

export { submitContribution } from './submit.js'
export { onPhotoUploaded } from './onPhotoUploaded.js'
export { moderate } from './moderate.js'
export { report } from './report.js'
export { snapshot } from './snapshot.js'
export { missionInfo, submitVideo, selectVideo } from './video.js'
export { exportDaily, exportDailyNow, exportSelected } from './exports.js'
export { watchdog } from './watchdog.js'
// D7: retention (60 days)
