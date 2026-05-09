import { ErrorState } from "../error-state/ErrorState";

export function AccessDeniedState() {
  return (
    <ErrorState
      message="Your role does not include access to this workspace. Ask an administrator to adjust your role or entity scope."
      title="Access denied"
    />
  );
}

export function NotFoundState() {
  return (
    <ErrorState
      message="The requested ProcureDesk workspace does not exist."
      title="Workspace not found"
    />
  );
}
