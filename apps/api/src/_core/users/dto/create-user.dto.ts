import { IsEmail, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one digit',
  })
  password!: string;

  @IsString()
  nom!: string;

  @IsString()
  prenom!: string;

  @IsUUID()
  role_id!: string;
}
