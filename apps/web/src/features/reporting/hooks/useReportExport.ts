import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  createExportJob,
  createSavedView,
  getExportJob,
  type ExportFormat,
  type ReportCode,
} from "../api/reportingApi";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

const lastExportJobStorageKey = "procuredesk:last-report-export-job-id";

export function useReportExport(
  reportCode: ReportCode,
  exportFilters: Record<string, unknown>,
  savedViewFilters: Record<string, unknown>,
  selectedIds: string[],
  savedViewName: string,
  setSavedViewName: (name: string) => void,
  options: {
    initialExportJobId?: string;
    onExportCreated?: (job: { id: string }) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [exportJobId, setExportJobIdState] = useState(() => options.initialExportJobId ?? readLastExportJobId());
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");

  const setExportJobId = useCallback((jobId: string) => {
    setExportJobIdState(jobId.trim());
  }, []);

  useEffect(() => {
    if (options.initialExportJobId) {
      setExportJobId(options.initialExportJobId);
    }
  }, [options.initialExportJobId, setExportJobId]);

  useEffect(() => {
    if (exportJobId) {
      window.localStorage.setItem(lastExportJobStorageKey, exportJobId);
    }
  }, [exportJobId]);

  const exportStatus = useQuery({
    enabled: Boolean(exportJobId),
    queryFn: () => getExportJob(exportJobId),
    queryKey: ["export-job", exportJobId],
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "running" ? 3000 : false,
  });

  const exportMutation = useMutation({
    mutationFn: () => {
      const payload = {
        filters: exportFilters,
        format: exportFormat,
        reportCode,
        ...(selectedIds.length ? { selectedIds } : {}),
      };
      return createExportJob(payload);
    },
    onSuccess: (result) => {
      setExportJobId(result.id);
      options.onExportCreated?.(result);
      notify({
        message: selectedIds.length
          ? `Export queued for ${selectedIds.length} selected rows.`
          : `Export queued: ${result.id}`,
        tone: "success",
      });
    },
  });

  const savedViewMutation = useMutation({
    mutationFn: () =>
      createSavedView({
        columns: [],
        filters: savedViewFilters,
        name: savedViewName.trim(),
        reportCode,
      }),
    onSuccess: async () => {
      setSavedViewName("");
      await queryClient.invalidateQueries({ queryKey: ["report", "saved-views", reportCode] });
      notify({ message: "Report view saved.", tone: "success" });
    },
  });

  const canDownloadExport =
    Boolean(exportJobId) &&
    exportStatus.data?.status === "completed" &&
    Boolean(exportStatus.data.fileAssetId);

  return {
    canDownloadExport,
    exportFormat,
    exportJobId,
    exportMutation,
    exportStatus,
    selectedExportCount: selectedIds.length,
    savedViewMutation,
    setExportFormat,
    setExportJobId,
  };
}

function readLastExportJobId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(lastExportJobStorageKey) ?? "";
}
