import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActiveManageMaterialsOperations } from "../../../apis/gateway-api";
import {
  collectLockedPaths,
  isPathLocked,
} from "../../../common/utils/manageMaterialsLocks";
import { type ManageMaterialsOperation } from "../../../schemas";

export const ACTIVE_OPERATIONS_POLL_INTERVAL_MS = 10_000;

export const activeManageMaterialsQueryKey = (caseId: string) => [
  "manage-materials-active",
  caseId,
];

export const useActiveManageMaterialsOperations = (
  caseId: string,
  initialOperations: ManageMaterialsOperation[] | undefined,
  enabled: boolean,
) => {
  const { data, refetch } = useQuery({
    queryKey: activeManageMaterialsQueryKey(caseId),
    queryFn: () => getActiveManageMaterialsOperations(caseId),
    initialData: initialOperations,
    enabled,
    retry: false,
    refetchOnMount: "always",
    refetchInterval: (query) =>
      query.state.data?.length ? ACTIVE_OPERATIONS_POLL_INTERVAL_MS : false,
    // Locks are advisory in the UI; the backend still rejects overlapping
    // operations with a 409, so a failed poll keeps the last known locks.
    throwOnError: false,
  });

  const activeOperations = useMemo(() => data ?? [], [data]);

  const lockedPaths = useMemo(
    () => collectLockedPaths(activeOperations),
    [activeOperations],
  );

  const isLocked = useCallback(
    (path: string) => isPathLocked(path, lockedPaths),
    [lockedPaths],
  );

  return { activeOperations, lockedPaths, isLocked, refetch };
};
