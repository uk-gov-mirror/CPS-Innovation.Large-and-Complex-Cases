import { useCallback, useEffect, useRef, useState } from "react";
import { pollTransferStatus } from "../../../common/utils/pollTransferStatus";
import {
  type TransferFailedItem,
  type TransferStatusResponse,
} from "../../../schemas";

export const BATCH_COPY_OPERATION_TYPE = "BatchCopy";

export type TrackedCopy = {
  id: string;
  destinationPath: string;
};

export type CopyProgress = {
  id: string;
  userName: string;
  totalFiles: number;
  processedFiles: number;
};

export type CopyResult = {
  id: string;
  userName: string;
  status: "Completed" | "PartiallyCompleted" | "Failed";
  destinationPath: string;
  successfulItems: { path: string }[];
  failedItems: TransferFailedItem[];
};

type UseTrackManageMaterialsCopyArgs = {
  copy: TrackedCopy | null;
  onCopyFinished: (result: CopyResult) => void;
};

const isFinalStatus = (
  status: TransferStatusResponse["status"],
): status is CopyResult["status"] =>
  status === "Completed" ||
  status === "PartiallyCompleted" ||
  status === "Failed";

/**
 * Polls the status of the case's in-progress copy, reporting the file counts
 * while it runs and the result once it finishes. Each copy is only polled
 * once, so a copy that is still listed as active after it has finished is not
 * tracked again.
 */
export const useTrackManageMaterialsCopy = ({
  copy,
  onCopyFinished,
}: UseTrackManageMaterialsCopyArgs) => {
  const trackedIds = useRef(new Set<string>());
  const unmounting = useRef(false);
  const onCopyFinishedRef = useRef(onCopyFinished);
  const [progress, setProgress] = useState<CopyProgress | null>(null);
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

  const isUnmounting = useCallback(() => unmounting.current, []);

  const copyId = copy?.id;
  const destinationPath = copy?.destinationPath ?? "";

  useEffect(() => {
    if (!copyId || trackedIds.current.has(copyId)) return;
    trackedIds.current.add(copyId);
    void pollTransferStatus(
      copyId,
      isUnmounting,
      (response) => {
        if (!isFinalStatus(response.status)) {
          setProgress({
            id: copyId,
            userName: response.userName,
            totalFiles: response.totalFiles,
            processedFiles: response.processedFiles,
          });
          return;
        }
        setProgress(null);
        onCopyFinishedRef.current({
          id: copyId,
          userName: response.userName,
          status: response.status,
          destinationPath,
          successfulItems: response.successfulItems.map(({ sourcePath }) => ({
            path: sourcePath,
          })),
          failedItems: response.failedItems,
        });
      },
      setPollingError,
    );
  }, [copyId, destinationPath, isUnmounting]);

  return { progress: progress?.id === copyId ? progress : null };
};
