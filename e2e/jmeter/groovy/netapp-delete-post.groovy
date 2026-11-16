// "12b NetApp cleanup - delete transferred file". delete/batch returns 200
// with per-item outcomes, so check the counts. Not fatal: the transfer has
// already been measured, a leftover copy only takes up space.
import groovy.json.JsonSlurper

def code = prev.responseCode
if (!(code ==~ /2\d\d/)) {
    if (code == '401') {
        vars.put('aadTokenAt', '0')
    }
    if (code == '400' || code == '403') {
        vars.put('cmsAuthAt', '0')
    }
    prev.setSuccessful(false)
    prev.setResponseMessage("NetApp delete failed (${code}); copy left in ${vars.get('netappFolderPath')}")
    log.warn("${vars.get('threadLabel')} NetApp delete of ${vars.get('egressFileName')} failed (${code}): ${prev.responseDataAsString.take(300)}")
    return
}

def body = new JsonSlurper().parseText(prev.responseDataAsString ?: '{}')
if ((body.succeeded ?: 0) >= 1) {
    prev.setResponseMessage('Deleted from NetApp')
} else {
    prev.setSuccessful(false)
    def error = body.results ? body.results[0].error : null
    prev.setResponseMessage("NetApp delete ${body.status}: succeeded=${body.succeeded} notFound=${body.notFound} failed=${body.failed}" +
                            (error ? " (${error})" : ''))
    log.warn("${vars.get('threadLabel')} ${prev.responseMessage} for ${vars.get('netappFolderPath')}${vars.get('egressFileName')}")
}
