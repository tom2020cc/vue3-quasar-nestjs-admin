import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './entities/menu.entity';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu) private readonly menusRepo: Repository<Menu>,
  ) {}
  async create(postObj: CreateMenuDto) {
    const menu = await this.menusRepo.create(postObj);
    const resByName = await this.findOneBy(postObj.name);
    if (resByName) {
      throw new NotFoundException('栏目名称重复');
    }
    return await this.menusRepo.save(menu);
  }

  async findAll() {
    return await this.menusRepo.find();
  }

  async findOneById(id: string) {
    if (!id) {
      return null;
    }
    const res = await this.menusRepo.findOneBy({ id });
    if (!res) {
      throw new NotFoundException('没有找到该栏目');
    }
    return res;
  }

  async update(id: string, postObj: UpdateMenuDto) {
    const menu = await this.findOneById(id);
    // 名称未改变时跳过重复校验，避免编辑自身被误判为重复
    if (postObj.name && postObj.name !== menu.name) {
      const resByName = await this.findOneBy(postObj.name);
      if (resByName && String(resByName.id) !== String(id)) {
        throw new NotFoundException('栏目名称重复');
      }
    }
    const newObj = { ...menu, ...postObj };
    return await this.menusRepo.save(newObj);
  }

  async remove(id: string) {
    const menu = await this.findOneById(id);
    const res = await this.menusRepo.remove(menu);
    return { msg: '删除成功', res };
  }
  async findOneBy(name: string) {
    //检查栏目名称是否重复
    return await this.menusRepo.findOne({ where: { name } });
  }
}
