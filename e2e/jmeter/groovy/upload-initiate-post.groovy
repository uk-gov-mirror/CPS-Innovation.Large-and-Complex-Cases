// PostProcessor on "03 Egress upload - initiate".
import groovy.json.JsonSlurper

vars.put('uploadStart', prev.startTime as String)

if (prev.responseCode ==~ /2\d\d/) {
    vars.put('uploadId', new JsonSlurper().parseText(prev.responseDataAsString).id as String)
} else {
    if (prev.responseCode == '401') {
        vars.put('egressReauth', 'true')
    }
    vars.put('moreChunks', 'false')
    vars.put('failedStage', 'upload-initiate')
    vars.put('failureMessage', "Upload initiate failed (${prev.responseCode}): ${prev.responseDataAsString.take(200)}")
}
