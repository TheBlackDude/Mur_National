import { setGlobalOptions } from 'firebase-functions/v2'
import { initializeApp } from 'firebase-admin/app'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 50, enforceAppCheck: true })

export { submitContribution } from './submit.js'
export { onPhotoUploaded } from './onPhotoUploaded.js'
export { moderate } from './moderate.js'
export { report } from './report.js'
export { snapshot } from './snapshot.js'
// D6: submitVideo, selectVideo, exportDaily (Sheets), exportSelected (Drive), retention (60 days)
