// PostProcessor on "05 Egress upload - complete": start the Egress processing clock.
vars.put('uploadEnd', prev.endTime as String)

if (prev.responseCode ==~ /2\d\d/) {
    vars.put('egressWaitStart', prev.endTime as String)
    vars.put('pollEgress', 'true')
} else {
    if (prev.responseCode == '401') {
        vars.put('egressReauth', 'true')
    }
    vars.put('failedStage', 'upload-complete')
    vars.put('failureMessage', "Upload complete failed (${prev.responseCode}): ${prev.responseDataAsString.take(200)}")
}
