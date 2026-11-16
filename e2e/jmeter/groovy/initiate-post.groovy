// PostProcessor on "10 LCC transfer - initiate".
//
// LCC allows one active transfer per case. If the case already has one in
// progress, initiate returns THAT transfer's id rather than starting a new one
// (InitiateTransfer.cs), so this user's file would never be moved. Every
// transfer id is recorded against the thread that first received it, and a
// second thread receiving the same id is failed here rather than left polling
// someone else's transfer.
import groovy.json.JsonSlurper

if (!(prev.responseCode ==~ /2\d\d/)) {
    if (prev.responseCode == '401') {
        vars.put('aadTokenAt', '0')
    }
    vars.put('failedStage', 'transfer-initiate')
    vars.put('failureMessage', "Initiate failed (${prev.responseCode}): ${prev.responseDataAsString.take(200)}")
    return
}

def body = new JsonSlurper().parseText(prev.responseDataAsString)
def id = body.id as String
vars.put('transferId', id)
vars.put('transferStatus', body.status as String)

def me = "${vars.get('threadLabel')} (case ${vars.get('caseId')}, ${vars.get('fileName')})"
def owner = props.get('lcc.transferOwners').putIfAbsent(id, me)
if (owner != null) {
    def msg = "Transfer ${id} already belongs to ${owner}: case ${vars.get('caseId')} had an active transfer, " +
              "so this file was not queued"
    prev.setSuccessful(false)
    prev.setResponseMessage(msg)
    vars.put('failedStage', 'transfer-initiate')
    vars.put('failureMessage', msg)
    return
}

vars.put('ownsTransfer', 'true')
vars.put('transferStart', prev.startTime as String)
vars.put('pollTransfer', 'true')
