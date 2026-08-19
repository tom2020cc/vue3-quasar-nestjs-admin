import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './jwt.payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(config: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            // 密钥从环境变量读取，避免硬编码入库
            secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret-change-me',
        });
    }
    async validate(payload: JwtPayload) {
        return { userId: payload.sub, email: payload.email };
    }
}
