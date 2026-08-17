import { ApiProperty } from "@nestjs/swagger";
import {  IsArray, IsBoolean, IsNumber, IsString } from "class-validator";

export class CreateMenuDto {

    @ApiProperty({description:'栏目名称',example:'用户管理'})
    @IsString()
    name:string;

    @ApiProperty({description:'父级菜单ID',example:0,default:0})
    @IsNumber()
    parentId:number;

    @ApiProperty({description:'创建人',example:'Jack'})
    @IsString()
    publisher:string;

    @ApiProperty({description:'路径',example:'/abc'})
    @IsString()
    href:string;

    @ApiProperty({description:'图标地址',example:['aa','bb','cc']})
    @IsArray()
    icon:string[];

    @ApiProperty({description:'排序',example:255,default:0})
    @IsNumber()
    orderNum:number;

    @ApiProperty({description:'是否显示',example:true})
    @IsBoolean()
    show:boolean;

}
