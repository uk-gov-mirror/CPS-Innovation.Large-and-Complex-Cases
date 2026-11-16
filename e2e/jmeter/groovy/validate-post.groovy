// PostProcessor on "09 LCC transfer - validate". An HTTP error stops the
// journey; isInvalid=true fails the sample but the transfer is still attempted,
// matching the Playwright harness.
import groovy.json.JsonSlurper

if (!(prev.responseCode ==~ /2\d\d/)) {
    if (prev.responseCode == '401') {
        vars.put('aadTokenAt', '0')
    }
    vars.put('failedStage', 'transfer-validate')
    vars.put('failureMessage', "Validate failed (${prev.responseCode}): ${prev.responseDataAsString.take(200)}")
    return
}

def body = new JsonSlurper().parseText(prev.responseDataAsString ?: '{}')
if (body.isInvalid) {
    prev.setSuccessful(false)
    prev.setResponseMessage("Validation reported isInvalid=true: ${prev.responseDataAsString.take(300)}")
}
