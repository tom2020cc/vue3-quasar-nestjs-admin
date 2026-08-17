import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Menu {
    @PrimaryGeneratedColumn()
    id: string;

    @Column({ length: 20, comment: '栏目名称' })
    name: string;
    @Column({ comment: '父级菜单ID' })
    parentId: number

    @Column({ comment: '创建人' })
    publisher: string;

    @Column({ comment: '路径' })
    href: string;
    
    // 字符串数组（图标地址）；SQLite 不支持数组类型，改用 simple-json 存储
    @Column('simple-json', { nullable: true, comment: '图标地址' })
    icon: string[];

    @Column({ comment: '是否显示' })
    show: boolean;

    @Column({ comment: '排序' })
    orderNum: number;

    @CreateDateColumn({ comment: '创建时间' })
    createTime: Date;

    @UpdateDateColumn({ comment: '更新时间' })
    updateTime: Date;
}
