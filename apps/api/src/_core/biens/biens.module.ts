import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { StorageModule } from '../storage/storage.module';

import { BiensController } from './biens.controller';
import { BienPhotosController } from './bien-photos.controller';

import { BiensService } from './biens.service';
import { BienPhotosService } from './bien-photos.service';
import { BienHistoriqueService } from './bien-historique.service';
import { BiensSpatialService } from './biens-spatial.service';
import { BiensStatsService } from './biens-stats.service';

import { BiensRepository } from './repositories/biens.repository';
import { BiensGeoRepository } from './repositories/biens-geo.repository';

import { BiensScoringModule } from './scoring/scoring.module';
import { BiensInsightsModule } from './insights/insights.module';
import { AskKuraBiensModule } from './ask-kura/ask-kura-biens.module';
import { BiensIndexerModule } from './indexing/biens-indexer.module';
import { GeocodingModule } from './geocoding/geocoding.module';

@Module({
  imports: [
    AuditModule,
    EventsModule,
    StorageModule,
    BiensScoringModule,
    BiensInsightsModule,
    AskKuraBiensModule,
    BiensIndexerModule,
    GeocodingModule,
  ],
  controllers: [BiensController, BienPhotosController],
  providers: [
    BiensService,
    BienPhotosService,
    BienHistoriqueService,
    BiensSpatialService,
    BiensStatsService,
    BiensRepository,
    BiensGeoRepository,
  ],
  exports: [
    BiensService,
    BiensRepository,
    BiensSpatialService,
    BiensStatsService,
    BiensScoringModule,
    BiensInsightsModule,
    AskKuraBiensModule,
    GeocodingModule,
  ],
})
export class BiensModule {}
