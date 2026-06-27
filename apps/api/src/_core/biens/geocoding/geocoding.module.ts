import { Module } from '@nestjs/common';

import { ReverseGeocodingService } from './reverse-geocoding.service';

@Module({
  providers: [ReverseGeocodingService],
  exports: [ReverseGeocodingService],
})
export class GeocodingModule {}
