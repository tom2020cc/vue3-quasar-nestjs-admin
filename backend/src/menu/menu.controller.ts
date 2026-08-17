import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

@Controller('menus')
@ApiTags('栏目管理')
export class MenuController {
  constructor(private readonly menusService: MenuService) {}

  @ApiOperation({ summary: '增加菜单栏目', description: '添加一个栏目信息' })
  @ApiBody({ type: CreateMenuDto, description: '输入菜单栏目信息' })
  @Post()
  create(@Body() postObj: CreateMenuDto) {
    return this.menusService.create(postObj);
  }

  @ApiOperation({ summary: '获取菜单栏目', description: '获取所有的菜单栏目' })
  @Get()
  findAll() {
    return this.menusService.findAll();
  }

  @ApiOperation({ summary: '获取一条栏目信息', description: '根据id值获取该栏目的信息' })
  @ApiParam({ name: 'id', description: 'ID', required: true, example: 226 })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menusService.findOneById(id);
  }

  @ApiOperation({ summary: '修改一条栏目信息', description: '根据id值修改栏目信息' })
  @ApiParam({ name: 'id', description: 'ID', required: true, example: 698 })
  @Patch(':id')
  update(@Param('id') id: string, @Body() postObj: UpdateMenuDto) {
    return this.menusService.update(id, postObj);
  }

  @ApiOperation({ summary: '删除栏目', description: '根据id值删除一条栏目信息' })
  @ApiParam({ name: 'id', description: 'ID', required: true, example: 222 })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menusService.remove(id);
  }
}
