import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcryptjs from 'bcryptjs';

@Injectable()
export class UserService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // 启动时若用户表为空，则创建一个默认管理员，方便演示登录
  async onApplicationBootstrap() {
    const count = await this.userRepo.count();
    if (count === 0) {
      await this.userRepo.save(
        this.userRepo.create({ email: 'admin@qq.com', password: 'admin123' }),
      );
      console.log('已创建默认管理员：admin@qq.com / admin123');
    }
  }

  async create(postObj: CreateUserDto) {
    // 创建用户
    const { email } = postObj;
    const findOneByEmail = await this.findOneBy(email);
    if (findOneByEmail) {
      throw new NotFoundException('用户名重复');
    }
    const newUser = this.userRepo.create(postObj);
    const saved = await this.userRepo.save(newUser);
    // 不回传密码哈希
    const { password: _p, ...safe } = saved;
    return safe;
  }

  async findAll() {
    // 获取所有用户（排除密码字段）
    return this.userRepo.find({
      select: ['id', 'email', 'createTime', 'updateTime'],
    });
  }

  async findOneById(id: number) {
    // 根据 id 查询用户数据（对外，排除密码字段）
    if (!id) {
      return null;
    }
    const res = await this.userRepo.findOne({
      where: { id },
      select: ['id', 'email', 'createTime', 'updateTime'],
    });
    if (!res) {
      throw new NotFoundException('没有找到该用户');
    }
    return res;
  }

  // 内部使用：连密码一起取（更新/删除需要完整实体）
  private async findFullById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async update(id: number, postObj: UpdateUserDto) {
    // 更新用户数据
    const user = await this.findFullById(id);
    if (!user) {
      throw new NotFoundException('没有找到该用户');
    }
    if (postObj.email && postObj.email !== user.email) {
      const findOneByEmail = await this.findOneBy(postObj.email);
      if (findOneByEmail && findOneByEmail.id !== id) {
        throw new BadRequestException('用户名重复');
      }
    }
    const newObj = { ...user, ...postObj };
    if (postObj.password && !postObj.password.startsWith('$2')) {
      newObj.password = bcryptjs.hashSync(postObj.password, 10);
    }
    const saved = await this.userRepo.save(newObj);
    const { password: _p, ...safe } = saved;
    return safe;
  }

  async remove(id: number) {
    // 删除用户
    const user = await this.findFullById(id);
    if (!user) {
      throw new NotFoundException('没有找到该用户');
    }
    await this.userRepo.remove(user);
    return { msg: '删除成功' };
  }

  async findOneBy(email: string) {
    // 检查用户名是否重复（内部含密码，供登录比对）
    return await this.userRepo.findOne({ where: { email } });
  }
}
