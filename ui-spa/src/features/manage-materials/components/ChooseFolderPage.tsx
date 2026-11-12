import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getNetAppFolders, initiateBatchCopy } from "../../../apis/gateway-api";
import { ApiError } from "../../../common/errors/ApiError";
import { getFolderNameFromPath } from "../../../common/utils/getFolderNameFromPath";
import { isPathWithin } from "../../../common/utils/manageMaterialsLocks";
import {
  BackLink,
  ErrorSummary,
  NotificationBanner,
} from "../../../components/govuk";
import { PageContentWrapper } from "../../../components/govuk/PageContentWrapper";
import { Spinner } from "../../../components/common/Spinner";
import TransferWidget from "../../../components/common/transfer-widget/TransferWidget";
import { type TreeNode } from "../../../components/common/tree-view-component/TreeViewComponent";
import { MainStateContext } from "../../../providers/MainStateProvider";
import {
  type BatchOperationPayload,
  type NetAppFolder,
} from "../../../schemas";
import { useActiveManageMaterialsOperations } from "../hooks/useActiveManageMaterialsOperations";
import styles from "./ChooseFolderPage.module.scss";

const DEFAULT_ERROR_MESSAGE =
  "The materials could not be copied to this folder. Choose a different folder or try again later.";

const ChooseFolderPage: React.FC = () => {
  const { caseId } = useParams() as { caseId: string };
  const navigate = useNavigate();
  const location = useLocation();
  const {
    state: {
      appData: { manageMaterialsPage },
      apiData: { caseMetaData },
    },
    dispatch,
  } = useContext(MainStateContext);
  const { sourceItems } = manageMaterialsPage;
  const netAppPath = caseMetaData?.netappFolderPath ?? "";
  const hasValidState =
    manageMaterialsPage.caseId === caseId &&
    !!sourceItems.length &&
    !!netAppPath;

  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const manageMaterialsUrl = `/case/${caseId}/case-management${location.search}`;
  const manageMaterialsState = { activeTab: "manage-materials" };

  const {
    isLocked,
    lockedPaths,
    refetch: refetchActiveOperations,
  } = useActiveManageMaterialsOperations(
    caseId,
    caseMetaData?.activeManageMaterialsOperations,
    hasValidState,
  );

  const { data: rootFolderData, isLoading: isRootFolderLoading } = useQuery({
    queryKey: ["manage-materials-choose-folder", netAppPath],
    queryFn: () => getNetAppFolders(netAppPath),
    enabled: hasValidState,
    retry: false,
    throwOnError: true,
    staleTime: 0,
    gcTime: 0,
  });

  const copyMutation = useMutation({
    mutationFn: (payload: BatchOperationPayload) => initiateBatchCopy(payload),
  });

  useEffect(() => {
    if (errorMessages.length) errorSummaryRef.current?.focus();
  }, [errorMessages]);

  const sourceFolderPaths = useMemo(
    () =>
      sourceItems.filter(({ isFolder }) => isFolder).map(({ path }) => path),
    [sourceItems],
  );

  const isDestinationDisabled = useCallback(
    (path: string) =>
      isLocked(path) ||
      sourceFolderPaths.some((sourcePath) => isPathWithin(path, sourcePath)),
    [isLocked, sourceFolderPaths],
  );

  const mapToTreeNodes = useCallback(
    (folders: NetAppFolder[]): TreeNode[] =>
      folders.map((folder) => ({
        id: folder.path,
        name: getFolderNameFromPath(folder.path),
        path: folder.path,
        isFolder: true,
        isRootNode: false,
        disabled: isDestinationDisabled(folder.path),
      })),
    [isDestinationDisabled],
  );

  const treeData = useMemo(
    (): TreeNode[] => [
      {
        id: netAppPath,
        name: getFolderNameFromPath(netAppPath),
        path: netAppPath,
        isFolder: true,
        isRootNode: true,
        disabled: isDestinationDisabled(netAppPath),
        children: rootFolderData
          ? mapToTreeNodes(rootFolderData.folderData)
          : [],
      },
    ],
    [netAppPath, rootFolderData, isDestinationDisabled, mapToTreeNodes],
  );

  const handleLoadChildren = useCallback(
    async (path: string) => {
      const data = await getNetAppFolders(path);
      return mapToTreeNodes(data.folderData);
    },
    [mapToTreeNodes],
  );

  const navigateBack = () =>
    navigate(manageMaterialsUrl, {
      replace: true,
      state: manageMaterialsState,
    });

  const handleCopy = async (destination: TreeNode) => {
    setErrorMessages([]);
    try {
      const response = await copyMutation.mutateAsync({
        caseId: Number.parseInt(caseId),
        destinationPrefix: destination.path,
        operations: sourceItems.map(({ path, isFolder }) => ({
          type: isFolder ? "Folder" : "Material",
          sourcePath: path,
        })),
      });
      dispatch({
        type: "ADD_MANAGE_MATERIALS_PENDING_COPY",
        payload: {
          id: response.id,
          caseId,
          destinationPath: destination.path,
        },
      });
      navigateBack();
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 409 || error.code === 404)
      ) {
        setErrorMessages(
          (error.customMessage ?? DEFAULT_ERROR_MESSAGE)
            .split("\n")
            .filter(Boolean),
        );
        void refetchActiveOperations();
        return;
      }
      throw error;
    }
  };

  if (!hasValidState) {
    return (
      <Navigate to={manageMaterialsUrl} replace state={manageMaterialsState} />
    );
  }

  const itemCount = sourceItems.length;

  return (
    <div>
      <BackLink to={manageMaterialsUrl} replace state={manageMaterialsState}>
        Back
      </BackLink>
      <PageContentWrapper>
        {!!errorMessages.length && (
          <div
            ref={errorSummaryRef}
            tabIndex={-1}
            className={styles.errorSummaryWrapper}
          >
            <ErrorSummary
              data-testid="choose-folder-error-summary"
              titleChildren="There is a problem"
              errorList={errorMessages.map((message, index) => ({
                reactListKey: `${index}`,
                children: message,
                href: "#choose-folder-tree",
              }))}
            />
          </div>
        )}
        <h1>Choose a folder</h1>
        <p>{`You are copying ${itemCount} item${itemCount === 1 ? "" : "s"}.`}</p>
        <p>{`Select the folder you want to copy ${itemCount === 1 ? "it" : "them"} into.`}</p>

        {!!lockedPaths.length && (
          <NotificationBanner data-testid="choose-folder-locked-notification-banner">
            <p className="govuk-body">
              A copy is in progress for this case. Some folders are locked and
              cannot be selected.
            </p>
          </NotificationBanner>
        )}

        <div id="choose-folder-tree" className={styles.treeWrapper}>
          {isRootFolderLoading ? (
            <div className={styles.spinnerWrapper}>
              <Spinner data-testid="choose-folder-loader" diameterPx={50} />
              <div className={styles.spinnerText} aria-live="polite">
                Loading Shared Drive folders...
              </div>
            </div>
          ) : (
            <TransferWidget
              data={treeData}
              title={null}
              transferAction="Copy"
              isRootNodeOpened={true}
              isTransferDisabled={copyMutation.isPending}
              onLoadChildren={handleLoadChildren}
              handleTransfer={handleCopy}
              handleCancelClick={navigateBack}
            />
          )}
        </div>
      </PageContentWrapper>
    </div>
  );
};

export default ChooseFolderPage;
