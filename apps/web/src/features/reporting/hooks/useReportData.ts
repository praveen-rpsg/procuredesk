import { useQuery } from "@tanstack/react-query";

import {
  getReportFilterMetadata,
  getReportingAnalytics,
  listCompletedReport,
  listRcPoExpiryReport,
  listRunningReport,
  listSavedViews,
  listStageTimeReport,
  listTenderDetails,
  listVendorAwardsReport,
  type ReportCode,
  type ReportQueryParams,
} from "../api/reportingApi";

export function useReportData(
  reportCode: ReportCode,
  reportParams: ReportQueryParams,
  analyticsParams: ReportQueryParams,
) {
  const analytics = useQuery({
    queryFn: () => getReportingAnalytics(analyticsParams),
    queryKey: ["report", "analytics", analyticsParams],
  });

  const filterMetadata = useQuery({
    queryFn: getReportFilterMetadata,
    queryKey: ["report", "filter-metadata"],
  });

  const tenderDetails = useQuery({
    enabled: reportCode === "tender_details",
    queryFn: () => listTenderDetails(reportParams),
    queryKey: ["report", "tender-details", reportParams],
  });

  const running = useQuery({
    enabled: reportCode === "running",
    queryFn: () => listRunningReport(reportParams),
    queryKey: ["report", "running", reportParams],
  });

  const completed = useQuery({
    enabled: reportCode === "completed",
    queryFn: () => listCompletedReport(reportParams),
    queryKey: ["report", "completed", reportParams],
  });

  const vendorAwards = useQuery({
    enabled: reportCode === "vendor_awards",
    queryFn: () => listVendorAwardsReport(reportParams),
    queryKey: ["report", "vendor-awards", reportParams],
  });

  const stageTime = useQuery({
    queryFn: () => listStageTimeReport(analyticsParams),
    queryKey: ["report", "stage-time", analyticsParams],
  });

  const rcPoExpiry = useQuery({
    enabled: reportCode === "rc_po_expiry",
    queryFn: () => listRcPoExpiryReport(reportParams),
    queryKey: ["report", "rc-po-expiry", reportParams],
  });

  const savedViews = useQuery({
    queryFn: () => listSavedViews({ reportCode }),
    queryKey: ["report", "saved-views", reportCode],
  });

  const allSavedViews = useQuery({
    queryFn: () => listSavedViews(),
    queryKey: ["report", "saved-views", "all"],
  });

  return {
    allSavedViews,
    analytics,
    completed,
    filterMetadata,
    rcPoExpiry,
    running,
    savedViews,
    stageTime,
    tenderDetails,
    vendorAwards,
  };
}
