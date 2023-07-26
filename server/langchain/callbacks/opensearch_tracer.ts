/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTracer, Run } from 'langchain/callbacks';
import { OpenSearchClient } from '../../../../../src/core/server';
import { LLM_INDEX } from '../../../common/constants/llm';

export class OpenSearchTracer extends BaseTracer {
  name = 'opensearch_tracer' as const;

  constructor(private client: OpenSearchClient, private sessionId: string, private traces?: Run[]) {
    super();
  }

  protected async persistRun(_run: Run) {
    this.traces?.push(_run);
    try {
      await this.createIndex();
      this.indexRun(_run);
    } catch (error) {
      console.error(error); // do not crash server if request failed
    }
  }

  private async indexRun(run: Run) {
    this.client.index({
      index: LLM_INDEX.TRACES,
      body: { session_id: this.sessionId, ...run, child_runs: undefined },
    });
    if (run.child_runs) run.child_runs.forEach((childRun) => this.indexRun(childRun));
  }

  private async createIndex() {
    const existsResponse = await this.client.indices.exists({ index: LLM_INDEX.TRACES });
    if (!existsResponse.body) {
      return this.client.indices.create({
        index: LLM_INDEX.TRACES,
        body: {
          settings: {
            index: {
              number_of_shards: '1',
              auto_expand_replicas: '0-2',
              mapping: { ignore_malformed: true },
            },
          },
          mappings: {
            dynamic: 'false',
            properties: {
              actions: {
                properties: {
                  log: { type: 'keyword' },
                  tool: { type: 'keyword' },
                  toolInput: { type: 'keyword' },
                },
              },
              child_execution_order: { type: 'integer' },
              end_time: { type: 'date' },
              error: { type: 'keyword' },
              execution_order: { type: 'integer' },
              id: { type: 'keyword' },
              inputs: { properties: { input: { type: 'keyword' } } },
              name: { type: 'keyword' },
              outputs: { properties: { output: { type: 'keyword' } } },
              parent_run_id: { type: 'keyword' },
              run_type: { type: 'keyword' },
              serialized: { properties: { name: { type: 'keyword' } } },
              session_id: { type: 'keyword' },
              start_time: { type: 'date' },
            },
          },
        },
      });
    }
  }
}