// Aliases only. All wire shapes are generated from contract/openapi.yaml.
import type * as G from './generated';
export type User=G.UserOutput;
export type Role=User['role'];
export type LoginResponse=G.LoginOutput;
export type ApiErrorBody=G.ErrorOutput;
export type ErrorCode=ApiErrorBody['error']['code'];
export type Medication=G.MedicationOutput;
export type PatientViewItem=G.PatientMedication;
export type Discrepancy=G.DiscrepancyOutput;
export type AccessEvent=G.AccessOutput;
export type AuditEvent=G.AuditOutput;
