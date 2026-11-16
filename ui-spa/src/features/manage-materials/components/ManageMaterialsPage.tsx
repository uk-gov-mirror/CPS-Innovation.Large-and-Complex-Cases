import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNetAppFolders } from "../../../apis/gateway-api";
import { useUserDetails } from "../../../auth";
import { ApiError } from "../../../common/errors/ApiError";
import { mapToNetAppFolderData } from "../../../common/utils/mapToNetAppFolderData";
import { getFolderNameFromPath } from "../../../common/utils/getFolderNameFromPath";
import { getUrlSearchParam } from "../../../common/utils/getUrlSearchParam";
import { sortByStringProperty } from "../../../common/utils/sortUtils";
import { getCommonPath } from "../../../common/utils/getCommonPath";
import {
  isPathWithin,
  parsePaths,
} from "../../../common/utils/manageMaterialsPaths";
import {
  type ManageMaterialsOperation,
  type NetAppFileFolder,
} from "../../../schemas";
import {
  DropdownButton,
  type DropdownButtonItem,
} from "../../../components/common/DropdownButton";
import FolderPath from "../../../components/common/FolderPath";
import { Spinner } from "../../../components/common/Spinner";
import {
  Details,
  LinkButton,
  NotificationBanner,
} from "../../../components/govuk";
import RelativePathFiles from "../../../components/case-management/activity-log/RelativePathFiles";
import { MainStateContext } from "../../../providers/MainStateProvider";
import { useActiveManageMaterialsOperations } from "../hooks/useActiveManageMaterialsOperations";
import {
  BATCH_COPY_OPERATION_TYPE,
  type CopyResult,
  type TrackedCopy,
  useTrackManageMaterialsCopy,
} from "../hooks/useTrackManageMaterialsCopy";
import MaterialsTable, { SELECT_ALL_CHECKBOX_ID } from "./MaterialsTable";
import styles from "./ManageMaterialsPage.module.scss";

const SELECTION_ACTIONS = [
  { id: "copy", label: "Copy" },
  { id: "move", label: "Move" },
  { id: "rename", label: "Rename selected items" },
  { id: "delete", label: "Delete" },
];

const OPERATION_MESSAGES: Record<string, { own: string; otherUser: string }> = {
  BatchCopy: {
    own: "Copying materials",
    otherUser: "is currently copying materials",
  },
  BatchMove: {
    own: "Moving materials",
    otherUser: "is currently moving materials",
  },
};

const DEFAULT_OPERATION_MESSAGE = {
  own: "Updating materials",
  otherUser: "is currently updating materials",
};

const isSameUser = (a: string | null | undefined, b: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export const MANAGE_MATERIALS_QUERY_KEY = "manage-materials";

type ManageMaterialsPageProps = {
  isTabActive: boolean;
  caseId: string;
  operationName: string;
  netAppPath: string;
  initialActiveOperations?: ManageMaterialsOperation[];
};

const ManageMaterialsPage: React.FC<ManageMaterialsPageProps> = ({
  isTabActive,
  caseId,
  operationName,
  netAppPath,
  initialActiveOperations,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { username } = useUserDetails();
  const {
    state: {
      appData: { manageMaterialsPage },
    },
    dispatch,
  } = useContext(MainStateContext);

  const [folderPath, setFolderPath] = useState(() =>
    manageMaterialsPage.caseId === caseId &&
    manageMaterialsPage.folderPath &&
    isPathWithin(manageMaterialsPage.folderPath, netAppPath)
      ? manageMaterialsPage.folderPath
      : netAppPath,
  );
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [sortType, setSortType] = useState<"ascending" | "descending">();
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);
  const [finishedOperationIds, setFinishedOperationIds] = useState<string[]>(
    [],
  );

  const { activeOperations, refetch: refetchActiveOperations } =
    useActiveManageMaterialsOperations(
      caseId,
      initialActiveOperations,
      isTabActive,
    );

  const pendingCopy = useMemo(
    () =>
      manageMaterialsPage.pendingCopies.find(
        ({ id, caseId: pendingCaseId }) =>
          pendingCaseId === caseId && !finishedOperationIds.includes(id),
      ) ?? null,
    [manageMaterialsPage.pendingCopies, caseId, finishedOperationIds],
  );

  const activeOperation = useMemo(
    () =>
      activeOperations.find(({ id }) => !finishedOperationIds.includes(id)) ??
      null,
    [activeOperations, finishedOperationIds],
  );

  const trackedCopy = useMemo((): TrackedCopy | null => {
    if (pendingCopy) return pendingCopy;
    if (activeOperation?.operationType !== BATCH_COPY_OPERATION_TYPE)
      return null;
    return {
      id: activeOperation.id,
      destinationPath: parsePaths(activeOperation.destinationPaths)[0] ?? "",
    };
  }, [pendingCopy, activeOperation]);

  const isOperationInProgress = !!pendingCopy || !!activeOperation;

  const handleCopyFinished = useCallback(
    (result: CopyResult) => {
      setFinishedOperationIds((previous) => [...previous, result.id]);
      if (isSameUser(result.userName, username)) setCopyResult(result);
      dispatch({
        type: "REMOVE_MANAGE_MATERIALS_PENDING_COPY",
        payload: { id: result.id },
      });
      void queryClient.invalidateQueries({
        queryKey: [MANAGE_MATERIALS_QUERY_KEY],
      });
      void refetchActiveOperations();
    },
    [dispatch, queryClient, refetchActiveOperations, username],
  );

  const { progress: copyProgress } = useTrackManageMaterialsCopy({
    copy: trackedCopy,
    onCopyFinished: handleCopyFinished,
  });

  const {
    data: netAppData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [MANAGE_MATERIALS_QUERY_KEY, folderPath],
    queryFn: () => getNetAppFolders(folderPath),
    retry: false,
    enabled: isTabActive && !!folderPath,
    staleTime: 0,
    gcTime: 0,
  });

  const items = useMemo(() => {
    const folderData = netAppData ? mapToNetAppFolderData(netAppData) : [];
    return sortType
      ? sortByStringProperty(folderData, "name", sortType)
      : folderData;
  }, [netAppData, sortType]);

  const breadcrumbFolders = useMemo(() => {
    const parts = folderPath.replace(netAppPath, "").split("/").filter(Boolean);
    return [
      {
        folderName: `Shared Drive: ${getFolderNameFromPath(netAppPath)}`,
        folderPath: netAppPath,
      },
      ...parts.map((folderName, index) => ({
        folderName,
        folderPath: `${netAppPath}${parts.slice(0, index + 1).join("/")}/`,
      })),
    ];
  }, [folderPath, netAppPath]);

  const operationMessage = useMemo(() => {
    if (!isOperationInProgress) return null;
    const messages = pendingCopy
      ? OPERATION_MESSAGES[BATCH_COPY_OPERATION_TYPE]
      : (OPERATION_MESSAGES[activeOperation?.operationType ?? ""] ??
        DEFAULT_OPERATION_MESSAGE);
    const operationUserName =
      copyProgress?.userName ??
      (pendingCopy ? username : activeOperation?.userName);

    if (!operationUserName || isSameUser(operationUserName, username)) {
      return {
        ariaLabelText: messages.own,
        spinnerTextContent: <span>{messages.own}...</span>,
      };
    }
    return {
      ariaLabelText: `${operationUserName} ${messages.otherUser}`,
      spinnerTextContent: (
        <span>
          <b>{operationUserName}</b> {messages.otherUser}
        </span>
      ),
    };
  }, [
    isOperationInProgress,
    pendingCopy,
    activeOperation,
    copyProgress,
    username,
  ]);

  useEffect(() => {
    if (!isError || !error) return;
    if (error instanceof ApiError && error.code === 404) {
      navigate(
        `/case/${caseId}/case-management/shared-drive-connection-error?${getUrlSearchParam("operation-name", operationName)}`,
        { state: { isRouteValid: true } },
      );
      return;
    }
    if (error instanceof ApiError && error.code === 401) {
      navigate(
        `/case/${caseId}/case-management/connection-error?type=shareddrive`,
        { state: { isRouteValid: true } },
      );
      return;
    }
    throw error;
  }, [isError, error, caseId, operationName, navigate]);

  useEffect(() => {
    if (isOperationInProgress) setSelectedPaths([]);
  }, [isOperationInProgress]);

  const handleCheckboxChange = (id: string, checked: boolean) => {
    if (id === SELECT_ALL_CHECKBOX_ID) {
      setSelectedPaths(checked ? items.map(({ path }) => path) : []);
      return;
    }
    setSelectedPaths((previous) =>
      checked ? [...previous, id] : previous.filter((path) => path !== id),
    );
  };

  const navigateToFolder = (path: string) => {
    setFolderPath(path);
    setSelectedPaths([]);
  };

  const handleFolderClick = (item: NetAppFileFolder) =>
    navigateToFolder(item.path);

  const handleTableSort = (
    _sortName: string,
    type: "ascending" | "descending",
  ) => setSortType(type);

  const handleSelectionAction = (actionId: string) => {
    if (actionId !== "copy") return;
    setCopyResult(null);
    dispatch({
      type: "SET_MANAGE_MATERIALS_PAGE",
      payload: {
        caseId,
        folderPath,
        sourceItems: items
          .filter(({ path }) => selectedPaths.includes(path))
          .map(({ path, isFolder }) => ({ path, isFolder })),
      },
    });
    navigate(
      `/case/${caseId}/case-management/manage-materials-choose-folder${location.search}`,
    );
  };

  const selectionActionItems: DropdownButtonItem[] = SELECTION_ACTIONS.map(
    ({ id, label }) => ({
      id,
      label,
      ariaLabel: label,
      disabled: !selectedPaths.length,
    }),
  );

  const renderOperationInProgress = () => {
    const hasProgressMetrics = !!copyProgress?.totalFiles;
    return (
      <div className={styles.operationContent}>
        <output aria-live="polite" className="govuk-visually-hidden">
          {operationMessage?.ariaLabelText}
          {hasProgressMetrics &&
            `Copy progress, ${copyProgress.processedFiles} out of ${copyProgress.totalFiles} files processed`}
        </output>
        <div className={styles.spinnerWrapper}>
          <Spinner
            data-testid="manage-materials-operation-spinner"
            diameterPx={50}
          />
          <div
            className={styles.spinnerText}
            data-testid="manage-materials-operation-message"
          >
            {operationMessage?.spinnerTextContent}
            {hasProgressMetrics && (
              <div
                className={styles.progressMetrics}
                data-testid="copy-progress-metrics"
              >
                <span>total files : {copyProgress.totalFiles}</span>
                <span>files processed : {copyProgress.processedFiles}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCopyResultBanner = () => {
    if (!copyResult) return null;
    const sourcePath = getCommonPath([
      ...copyResult.successfulItems.map(({ path }) => path),
      ...copyResult.failedItems.map(({ sourcePath }) => sourcePath),
    ]);

    if (copyResult.status === "Completed") {
      return (
        <div className={styles.resultBanner}>
          <NotificationBanner
            type="success"
            data-testid="copy-success-notification-banner"
          >
            <b className={styles.resultMessage}>
              The materials have been copied
            </b>
            <p>
              They are in:{" "}
              <LinkButton
                onClick={() => navigateToFolder(copyResult.destinationPath)}
                dataTestId="copy-success-destination-folder"
              >
                {getFolderNameFromPath(copyResult.destinationPath)}
              </LinkButton>
            </p>
            <Details summaryChildren="Show copied materials">
              <RelativePathFiles
                successFiles={copyResult.successfulItems}
                errorFiles={[]}
                sourcePath={sourcePath}
                name="copy"
              />
            </Details>
          </NotificationBanner>
        </div>
      );
    }

    return (
      <div className={styles.resultBanner}>
        <NotificationBanner data-testid="copy-error-notification-banner">
          <b className={styles.resultMessage}>
            {copyResult.status === "PartiallyCompleted"
              ? "Some materials could not be copied"
              : "The materials could not be copied"}
          </b>
          <Details summaryChildren="Show materials that could not be copied">
            <RelativePathFiles
              successFiles={copyResult.successfulItems}
              errorFiles={copyResult.failedItems.map(({ sourcePath }) => ({
                path: sourcePath,
              }))}
              sourcePath={sourcePath}
              name="copy-error"
            />
          </Details>
        </NotificationBanner>
      </div>
    );
  };

  if (!isTabActive) return null;

  return (
    <div data-testid="manage-materials-page">
      <h2>Manage materials on the shared drive</h2>
      <p>You can add, rename or remove materials and folders.</p>
      <hr className={styles.sectionBreak} />

      {isOperationInProgress ? (
        renderOperationInProgress()
      ) : (
        <>
          {renderCopyResultBanner()}

          <FolderPath
            folders={breadcrumbFolders}
            disabled={isLoading}
            handleFolderPathClick={navigateToFolder}
          />

          <div className={styles.toolbar}>
            <DropdownButton
              name="Actions on selection"
              dropDownItems={selectionActionItems}
              callBackFn={handleSelectionAction}
              dataTestId="materials-actions-dropdown"
              disabled={isLoading}
            />
          </div>

          <MaterialsTable
            items={items}
            isLoading={isLoading}
            selectedPaths={selectedPaths}
            handleCheckboxChange={handleCheckboxChange}
            handleFolderClick={handleFolderClick}
            handleTableSort={handleTableSort}
          />
        </>
      )}
    </div>
  );
};

export default ManageMaterialsPage;
