import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Placeholder pour un endpoint Prometheus.
 * À compléter à l'étape 15 (infra/monitoring) avec prom-client.
 */
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  metrics(): string {
    // Étape 15 : return register.metrics() avec prom-client
    return '# Prometheus metrics endpoint — activé à l\'étape 15\n';
  }
}
