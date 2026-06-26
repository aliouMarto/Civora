import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

const E164 = /^\+[1-9]\d{7,14}$/;

export class CheckDuplicatesDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @Matches(E164, { message: 'telephone doit être au format E.164' })
  telephone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  nom?: string;
}
