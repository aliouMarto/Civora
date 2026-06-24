import { Injectable, Logger } from '@nestjs/common';
import { AiGatewayService } from '../../ai/ai-gateway.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import type { CallAiActionConfig, ActionResult } from './action.interface';
import { resolveTemplate } from '../workflow-template.util';

@Injectable()
export class CallAiAction {
  private readonly logger = new Logger(CallAiAction.name);

  constructor(
    private readonly aiGateway: AiGatewayService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async execute(
    config: CallAiActionConfig,
    context: Record<string, unknown>,
    dryRun = false,
  ): Promise<ActionResult> {
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.vars)) {
      vars[k] = resolveTemplate(v, context);
    }

    if (dryRun) {
      return { kind: 'call-ai', status: 'skipped', output: { dry_run: true, template: config.template, vars } };
    }

    try {
      const result = await this.aiGateway.chat({
        template: config.template,
        vars,
        module: 'workflow',
      });

      if (config.output_field) {
        context[config.output_field] = result.content;
      }

      return { kind: 'call-ai', status: 'success', output: { content: result.content, costCents: result.costCents } };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`call-ai action failed: ${msg}`);
      return { kind: 'call-ai', status: 'failed', error: msg };
    }
  }
}
