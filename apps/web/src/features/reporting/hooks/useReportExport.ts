import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  createExportJob,
  createSavedView,
  getExportJob,
  type ExportFormat,
  type ReportCode,
} from "../api/reportingApi";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

export function useReportExport(
  reportCode: ReportCode,
  exportFilters: Record<string, unknown>,
  savedViewFilters: Record<string, unknown>,
  savedViewName: string,
  setSavedViewName: (name: string) => void,
) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [exportJobId, setExportJobId] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");

  const exportStatus = useQuery({
    enabled: Boolean(exportJobId),
    queryFn: () => getExportJob(exportJobId),
    queryKey: ["export-job", exportJobId],
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "running" ? 3000 : false,
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      createExportJob({
        filters: exportFilters,
        format: exportFormat,
        reportCode,
      }),
    onSuccess: (result) => {
      setExportJobId(result.id);
      notify({ message: `Export queued: ${result.id}`, tone: "success" });
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
    savedViewMutation,
    setExportFormat,
    setExportJobId,
  };
}
