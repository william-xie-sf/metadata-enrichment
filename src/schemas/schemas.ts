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

import { XMLParser } from 'fast-xml-parser';
import type { EnrichmentResult } from '../enrichment/types/index.js';

export type MetadataTypeXmlSchema = {
  /**
   * Define how to apply enrichment result data into the XML metadata.
   * Called after the metadata file has been parsed and mutates xmlRoot in place.
   */
  applyEnrichment: (xmlRoot: Record<string, unknown>, result: EnrichmentResult) => void;
  /**
   * Define how to check if the user has opted out of enrichment based on the set <skipUplift> tag.
   * If you want to ignore this capability, always return false.
   */
  isSkipUpliftEnabled: (xmlRoot: Record<string, unknown>) => boolean;
};

export type MetadataTypeConfig = {
  // Connect API metadata type value for enrichment requests
  apiType: string;

  // Defines how enrichment is written to and read from the component's XML file
  xmlSchema: MetadataTypeXmlSchema;
};

/**
 * Parses the description field from an EnrichmentResult into an object suitable
 * for embedding in the <ai> XML block.
 *
 * The description may be plain text, or HTML-entity-encoded XML containing a
 * description tag and optionally one or more property tags.
 */
function parseDescriptionContent(description: string): Record<string, unknown> {
  const decodedDescription = description
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // Plain text — no encoded XML tags present
  // Wrap it in <description> tag and return it
  if (!description.includes('&lt;description&gt;')) {
    return { description: decodedDescription };
  }

  // Description contains encoded XML — parse the decoded fragment to extract child elements
  // And return this XML content back within <ai> tags
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    trimValues: true,
    isArray: (tagName) => tagName === 'property',
  });

  try {
    // Use a temporary <root> element to wrap the XML content for serialization purposes only
    const parsed = parser.parse(`<root>${decodedDescription}</root>`) as { root?: Record<string, unknown> };
    return parsed.root ?? { description: decodedDescription };
  } catch {
    return { description: decodedDescription };
  }
}

/**
 * Default XML metadata schema where enrichment is written within <ai> block at metadata's root level.
 *
 * Example output structure:
 * ```
 * <LightningComponentBundle>
 *   <ai>
 *     <skipUplift>false</skipUplift>
 *     <description>...</description>
 *     <score>0.95</score>
 *   </ai>
 * </LightningComponentBundle>
 * ```
 */
export const DEFAULT_XML_METADATA_SCHEMA: MetadataTypeXmlSchema = {
  applyEnrichment(xmlRoot, result) {
    Object.assign(xmlRoot, {
      ai: {
        skipUplift: 'false',
        ...parseDescriptionContent(result.description),
        score: String(result.descriptionScore),
      },
    });
  },
  isSkipUpliftEnabled(xmlRoot) {
    const root = xmlRoot as { ai?: { skipUplift?: string | boolean } };
    const skipUplift = root.ai?.skipUplift;
    return skipUplift === true || String(skipUplift).toLowerCase() === 'true';
  },
};


/**
 * XML metadata schema for SalesforceObject where enrichment is written within <aiDescriptor> block.
 *
 * Example output structure:
 * ```
 * <CustomObject>
 *   <aiDescriptor>
 *     <skipUplift>false</skipUplift>
 *     <enrichedDescription>...</enrichedDescription>
 *     <score>0.95</score>
 *   </aiDescriptor>
 * </CustomObject>
 * ```
 */
export const SALESFORCE_OBJECT_XML_METADATA_SCHEMA: MetadataTypeXmlSchema = {
  applyEnrichment(xmlRoot, result) {
    Object.assign(xmlRoot, {
      aiDescriptor: {
        skipUplift: 'false',
        enrichedDescription: result.description,
        score: String(result.descriptionScore),
      },
    });
  },
  isSkipUpliftEnabled(xmlRoot) {
    const root = xmlRoot as { aiDescriptor?: { skipUplift?: string | boolean } };
    const skipUplift = root.aiDescriptor?.skipUplift;
    return skipUplift === true || String(skipUplift).toLowerCase() === 'true';
  },
};
