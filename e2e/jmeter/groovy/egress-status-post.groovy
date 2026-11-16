// PostProcessor on "07 Egress processing - status poll": Egress only assigns a
// file_id once it has finished processing the upload.
import groovy.json.JsonSlurper

vars.put('egressPolls', ((vars.get('egressPolls') as int) + 1) as String)

if (prev.responseCode == '200') {
    def body = new JsonSlurper().parseText(prev.responseDataAsString)
    if (body.file_id) {
        vars.put('fileId', body.file_id as String)
        vars.put('egressFileName', (body.file_name ?: vars.get('fileName')) as String)
        vars.put('pollEgress', 'false')
        return
    }
} else if (prev.responseCode == '401') {
    vars.put('egressReauth', 'true')
}

long waited = System.currentTimeMillis() - (vars.get('egressWaitStart') as long)
if (waited > (vars.get('egressProcessingTimeoutSec') as long) * 1000L) {
    vars.put('pollEgress', 'false')
}
