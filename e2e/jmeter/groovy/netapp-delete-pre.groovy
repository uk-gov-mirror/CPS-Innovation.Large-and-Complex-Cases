// Pre-processor of "12b NetApp cleanup - delete transferred file". The copy
// lands flat in the case's NetApp folder under the Egress file name, and
// delete/batch only accepts paths inside that folder.
import groovy.json.JsonOutput

vars.put('netappDeleteBody', JsonOutput.toJson([
    caseId    : vars.get('caseId') as long,
    operations: [[type: 'Material', sourcePath: vars.get('netappFolderPath') + vars.get('egressFileName')]],
]))
