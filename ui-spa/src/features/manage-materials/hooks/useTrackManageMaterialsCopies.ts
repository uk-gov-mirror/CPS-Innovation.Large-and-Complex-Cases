import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pollTransferStatus } from "../../../common/utils/pollTransferStatus";
import { parsePaths } from "../../../common/utils/manageMaterialsLocks";
import {
  type ManageMaterialsOperation,
  type TransferFailedItem,
  type TransferStatusResponse,
} from "../../../schemas";

export const BATCH_COPY_OPERATION_TYPE = "BatchCopy";

export type TrackedCopy = {
  id: string;
  destinationPath: string;
};

export type CopyResult = {
  id: string;
  status: "Completed" | "PartiallyCompleted" | "Failed";
  destinationPath: string;
  successfulItems: { path: string }[];
  failedItems: TransferFailedItem[];
};

type UseTrackManageMaterialsCopiesArgs = {
  activeOperations: ManageMaterialsOperation[];
  pendingCopies: TrackedCopy[];
  username: string;
  enabled: boolean;
  onCopyFinished: (result: CopyResult) => void;
};

const isFinalStatus = (
  status: TransferStatusResponse["status"],
): status is CopyResult["status"] =>
  status === "Completed" ||
  status === "PartiallyCompleted" ||
  status === "Failed";

/**
 * Tracks the current user's copies so a result can be shown when each one
 * finishes. Copies come from two places: copies started in this session (so a
 * copy that finishes before the active operations list is refreshed is not
 * missed) and the user's BatchCopy rows in the active operations list (so
 * tracking resumes after a refresh or after leaving the page).
 */
export const useTrackManageMaterialsCopies = ({
  activeOperations,
  pendingCopies,
  username,
  enabled,
  onCopyFinished,
}: UseTrackManageMaterialsCopiesArgs) => {
  const trackedIds = useRef(new Set<string>());
  const unmounting = useRef(false);
  const onCopyFinishedRef = useRef(onCopyFinished);
  const [pollingError, setPollingError] = useState<Error | null>(null);

  useEffect(() => {
    onCopyFinishedRef.current = onCopyFinished;
  }, [onCopyFinished]);

  useEffect(() => {
    unmounting.current = false;
    return () => {
      unmounting.current = true;
    };
  }, []);

  useEffect(() => {
    if (pollingError) throw pollingError;
  }, [pollingError]);

  const copiesToTrack = useMemo(() => {
    const ownActiveCopies: TrackedCopy[] = activeOperations
      .filter(
        (operation) =>
          operation.operationType === BATCH_COPY_OPERATION_TYPE &&
          !!username &&
          operation.userName?.toLowerCase() === username.toLowerCase(),
      )
      .map((operation) => ({
        id: operation.id,
        destinationPath: parsePaths(operation.destinationPaths)[0] ?? "",
      }));
    const byId = new Map<string, TrackedCopy>();
    [...pendingCopies, ...ownActiveCopies].forEach((copy) => {
      if (!byId.has(copy.id)) byId.set(copy.id, copy);
    });
    return [...byId.values()];
  }, [activeOperations, pendingCopies, username]);

  const isUnmounting = useCallback(() => unmounting.current, []);

  useEffect(() => {
    if (!enabled) return;
    copiesToTrack
      .filter(({ id }) => !trackedIds.current.has(id))
      .forEach((copy) => {
        trackedIds.current.add(copy.id);
        void pollTransferStatus(
          copy.id,
          isUnmounting,
          (response) => {
            if (!isFinalStatus(response.status)) return;
            onCopyFinishedRef.current({
              id: copy.id,
              status: response.status,
              destinationPath: copy.destinationPath,
              successfulItems: response.successfulItems.map(
                ({ sourcePath }) => ({ path: sourcePath }),
              ),
              failedItems: response.failedItems,
            });
          },
          setPollingError,
        );
      });
  }, [copiesToTrack, enabled, isUnmounting]);
};
