// PostProcessor on "01 AAD token": keep the bearer token for the LCC API calls.
import groovy.json.JsonSlurper

if (prev.responseCode == '200') {
    def token = new JsonSlurper().parseText(prev.responseDataAsString).access_token
    vars.put('aadToken', token)
    vars.put('aadTokenAt', System.currentTimeMillis() as String)
} else {
    // Hide the response body: AAD errors can echo the username.
    def msg = "AAD token request failed (${prev.responseCode})"
    log.error("${vars.get('threadLabel')}: ${msg}: ${prev.responseDataAsString.take(300)}")
    if (!vars.get('aadToken')) {
        vars.put('failedStage', 'auth')
        vars.put('failureMessage', msg)
    }
}
