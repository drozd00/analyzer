export interface AppEventInput {
  formId?: string;
  fieldId?: string;
  type: string;
  payload?: Record<string, unknown>;
}
