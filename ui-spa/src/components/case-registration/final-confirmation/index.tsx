import { Panel } from "../../govuk";
import { useContext } from "react";
import { PageContentWrapper } from "../../govuk/PageContentWrapper";
import { MainStateContext } from "../../../providers/MainStateProvider";
import {
  EGRESS_URL,
  CMS_CLASSIC_URL,
  CASES_AND_TASKS_URL,
} from "../../../config";
import styles from "./index.module.scss";
const CaseRegistrationFinalConfirmationPage = () => {
  const { state } = useContext(MainStateContext);
  const { urn, operationName, leadDefendantName } =
    state.appData.caseRegistrationCaseDetails ?? {};

  const egressCaseStatus =
    state.appData.manageSetupEgressSharedDrive.setupEgressStatus;
  const sharedDriveStatus =
    state.appData.manageSetupEgressSharedDrive.setupSharedDriveStatus;

  const getManageEgressStatus = () => {
    if (egressCaseStatus === "created") {
      return <li>created the Egress case</li>;
    }
    if (egressCaseStatus === "connected") {
      return <li>connected the Egress case</li>;
    }
    return <></>;
  };

  const getManageSharedDriveStatus = () => {
    if (sharedDriveStatus === "created") {
      return <li>created the Shared Drive folder</li>;
    }
    if (sharedDriveStatus === "connected") {
      return <li>connected the Shared Drive folder</li>;
    }
    return <></>;
  };

  const getWhatHasBeenCompletedContent = () => {
    if (egressCaseStatus === "skipped" && sharedDriveStatus === "skipped") {
      return null;
    }
    return (
      <ul className="govuk-list govuk-list--bullet">
        <li>
          <p>
            <span>registered the case URN:{urn}</span>
            <br />
            <span>operation name: {operationName ?? leadDefendantName}</span>
          </p>
        </li>

        {getManageEgressStatus()}
        {getManageSharedDriveStatus()}
      </ul>
    );
  };

  const getWhatStillNeedsToBeDoneContent = () => {
    if (egressCaseStatus === "created") {
      return (
        <p>Go to Egress to share a link with the investigating authority.</p>
      );
    }

    if (egressCaseStatus === "skipped" && sharedDriveStatus !== "skipped") {
      return (
        <p>
          Create or connect Egress and link it to this case if you need to
          transfer material.
        </p>
      );
    }

    return null;
  };

  const whatHasBeenCompletedContent = getWhatHasBeenCompletedContent();
  const whatStillNeedsToBeDoneContent = getWhatStillNeedsToBeDoneContent();

  return (
    <PageContentWrapper>
      <div className={styles.caseRegistrationFinalConfirmationPage}>
        <Panel titleChildren="Case registered ">
          {!whatHasBeenCompletedContent && (
            <>
              <span>URN</span>
              <br />
              <b>{urn}</b>
            </>
          )}
        </Panel>
        {whatHasBeenCompletedContent && (
          <section>
            <h2>What has been completed</h2>
            <p>You have:</p>
            {whatHasBeenCompletedContent}
          </section>
        )}
        {!whatHasBeenCompletedContent && (
          <p>Save the URN as you will need it to find or update the case.</p>
        )}
        {whatStillNeedsToBeDoneContent && (
          <section>
            <h2>What still needs to be done</h2>
            {whatStillNeedsToBeDoneContent}
          </section>
        )}
        <section>
          <h2>Next Steps</h2>
          <p>You can:</p>
          <ul className="govuk-list govuk-list--bullet">
            <li>
              go to{" "}
              <a href={EGRESS_URL} className="govuk-link">
                Egress
              </a>
            </li>
            <li>
              <a href={CMS_CLASSIC_URL} className="govuk-link">
                update the case on CMS Classic
              </a>
            </li>
            <li>
              <a href={CASES_AND_TASKS_URL} className="govuk-link">
                go back to your cases and tasks
              </a>
            </li>
          </ul>
        </section>
      </div>
    </PageContentWrapper>
  );
};
export default CaseRegistrationFinalConfirmationPage;
