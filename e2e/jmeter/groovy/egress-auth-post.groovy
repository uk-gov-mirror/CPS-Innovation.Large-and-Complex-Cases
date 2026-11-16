// PostProcessor on "02 Egress auth": Egress expects its session token
// Base64-encoded and sent back as Basic auth (same as e2e/pw/helpers/egress-api.ts).
import groovy.json.JsonSlurper

if (prev.responseCode == '200') {
    def token = new JsonSlurper().parseText(prev.responseDataAsString).token
    vars.put('egressToken', token.toString().bytes.encodeBase64().toString())
    vars.put('egressTokenAt', System.currentTimeMillis() as String)
    vars.put('egressReauth', 'false')
} else {
    def msg = "Egress auth failed (${prev.responseCode})"
    log.error("${vars.get('threadLabel')}: ${msg}: ${prev.responseDataAsString.take(300)}")
    // Stop this user rather than retrying: repeated failed logins get the
    // client IP temporarily blocked by Egress.
    vars.put('failedStage', 'auth')
    vars.put('failureMessage', msg)
    prev.setStopThread(true)
}
