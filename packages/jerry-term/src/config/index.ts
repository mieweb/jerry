/**
 * Configuration module for jerry-term.
 */

export type {
  TermConfig,
  TermConfigFile,
  ByoProviderId,
  ProviderCredential,
  CredentialsVault,
  LastModelMap,
} from "./types.ts";
export {
  termConfigToProfile,
  getActiveApiKey,
  getActiveEndpoint,
  getLastModel,
  setCredential,
  setLastModel,
  clearCredential,
} from "./types.ts";

export { maskApiKey } from "./mask.ts";
export {
  loadTermConfig,
  saveTermConfig,
  getUserConfigPath,
  getRuntimeAvailability,
  getByoProviderAvailability,
} from "./loader.ts";
export type { RuntimeAvailability, ByoProviderAvailability } from "./loader.ts";

export type {
  ProviderModel,
  ProviderDefinition,
  PartitionOzwellModelsResult,
} from "./providers.ts";
export {
  PROVIDERS,
  OZWELL_RECOMMENDED_MODELS,
  partitionOzwellModels,
  getProvider,
  getProviderForRuntime,
  getByoProviders,
  toWireModel,
  fromWireModel,
  getBaseURLFromWireModel,
  DEFAULT_MODELS,
  getDefaultModel,
} from "./providers.ts";

export type { SelectionResult } from "./select.ts";
export {
  hasCredentials,
  selectRuntime,
  selectModel,
  setupCredentials,
  applySelection,
  switchRuntime,
  switchModel,
} from "./select.ts";

export type {
  ListOzwellModelsOptions,
  ListOzwellModelsResult,
} from "./list-ozwell-models.ts";
export { listOzwellModels } from "./list-ozwell-models.ts";

export type {
  ListOpenAIModelsOptions,
  ListOpenAIModelsResult,
  ErrorKind,
} from "./list-openai-models.ts";
export { listOpenAIModels } from "./list-openai-models.ts";

export type {
  ListAnthropicModelsOptions,
  ListAnthropicModelsResult,
  AnthropicModelInfo,
} from "./list-anthropic-models.ts";
export { listAnthropicModels } from "./list-anthropic-models.ts";

export type { ValidateCredentialsResult } from "./validate-credentials.ts";
export { validateCredentials } from "./validate-credentials.ts";
