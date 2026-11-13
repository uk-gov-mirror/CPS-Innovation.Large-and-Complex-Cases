import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActiveManageMaterialsOperations } from "../../../apis/gateway-api";
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
    // The backend still rejects a conflicting operation with a 409, so a
    // failed poll keeps the last known operations rather than erroring.
    throwOnError: false,
  });

  const activeOperations = useMemo(() => data ?? [], [data]);

  return { activeOperations, refetch };
};
