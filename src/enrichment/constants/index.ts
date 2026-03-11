/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export {
  API_ENDPOINT_ENRICHMENT,
  ENRICHMENT_REQUEST_ENTITY_ENCODING_HEADER,
  MAP_SOURCE_COMPONENT_TYPE_TO_METADATA_TYPE,
  API_METADATA_TYPE_SALESFORCE_OBJECT,
  API_METADATA_TYPE_FLEXIPAGE,
  API_METADATA_TYPE_LIGHTNING_TYPE,
  API_METADATA_TYPE_LWC,
  API_METADATA_TYPE_GENERIC,
  EnrichmentStatus,
  SUPPORTED_COMPONENT_TYPES,
} from './api.js';
export type { EnrichmentRequestRecord } from './api.js';
export {
  SOURCE_COMPONENT_TYPE_NAME_SALESFORCE_OBJECT,
  SOURCE_COMPONENT_TYPE_NAME_LWC,
} from './component.js';
export { SUPPORTED_MIME_TYPES } from './mimeTypes.js';
