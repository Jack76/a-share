import { Stock } from '../types';

// ═══════════════════════════════════════════════════════════════════
// V64.0: Profit Transmission Speed (利好传导时滞因子)
// ═══════════════════════════════════════════════════════════════════
// 'instant'   — 现货/大宗商品价格直接传导到当季利润 (油气、黄金、航运)
// 'quarterly' — 1-4个季度内需求/政策传导 (消费、金融、电子)
// 'annual'    — 合同制/预算制/研发周期，1年以上才兑现 (军工、航天、量子)
//
// 设计背景 (V64.0 by 美伊热战实盘验证):
//   地缘突发事件中，资金只涌入"立刻能算出利润增量"的板块 (instant)
//   而 annual 板块即使逻辑正确也会因资金虹吸被抽血暴跌
//   这是教科书线性推演 vs 实盘资金行为的核心矛盾
// ═══════════════════════════════════════════════════════════════════
export type TransmissionSpeed = 'instant' | 'quarterly' | 'annual';

export const PRESET_THEMES = [
  {
    name: "大金融",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 利率/成交量敏感，1-2季度传导
    stocks: [
      { code: "sz300059", name: "东方财富", note: "核心中军" },
      { code: "sh600030", name: "中信证券", note: "券商龙头" },
      { code: "sz002670", name: "国盛金控", note: "弹性龙" },
      { code: "sh601995", name: "中金公司", note: "投行龙头，并购重组预期" },
      { code: "sz000776", name: "广发证券", note: "财富管理龙头" }
    ]
  },
  {
    name: "低空经济",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 政策+基建周期，远期兑现
    stocks: [
      { code: "sz002085", name: "万丰奥威", note: "3连板，板块核心" },
      { code: "sz000099", name: "中信海直", note: "2连板，高标" },
      { code: "sz001696", name: "宗申动力", note: "首板确认" },
      { code: "sz301091", name: "深城交", note: "低空基建规划龙头，国资背景" },
      { code: "sz002405", name: "四维图新", note: "空域管理地图数据" },
      { code: "sh688631", name: "莱斯信息", note: "空管系统龙头，低空基础设施" }
    ]
  },
  {
    name: "高位妖股",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 情绪驱动，无基本面锚定
    stocks: [
      { code: "sz000833", name: "粤桂股份", note: "9连板，全场空间龙" },
      { code: "sz002528", name: "英飞拓", note: "4连板，老龙反抽" },
      { code: "sh600678", name: "四川金顶", note: "3连板，国资背景" },
      { code: "sz002432", name: "九安医疗", note: "历史妖王，情绪锚点" },
      { code: "sz300293", name: "蓝英装备", note: "光刻机概念，高弹性" }
    ]
  },
  {
    name: "CPO (光通信)",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 资本开支驱动，1-2季度订单传导
    stocks: [
      { code: "sz300308", name: "中际旭创", note: "全球光模块龙头，800G/1.6T核心供应商" },
      { code: "sz300502", name: "新易盛", note: "光模块核心标的，海外市场占比高" },
      { code: "sz300394", name: "天孚通信", note: "光器件平台型公司，受益AI算力爆发" },
      { code: "sz002281", name: "光迅科技", note: "国内领先的光电子器件供应商" },
      { code: "sz300620", name: "光库科技", note: "铌酸锂调制器核心" }
    ]
  },
  {
    name: "AI算力/服务器",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 云厂商Capex驱动
    stocks: [
      { code: "sh601138", name: "工业富联", note: "服务器代工龙头，绑定英伟达" },
      { code: "sz000977", name: "浪潮信息", note: "国内服务器龙头" },
      { code: "sh603019", name: "中科曙光", note: "液冷服务器+国产芯片" },
      { code: "sz300474", name: "景嘉微", note: "国产GPU领军者" },
      { code: "sz300396", name: "迪普科技", note: "算力网络安全+AI调度" }
    ]
  },
  {
    name: "AIGC应用 (内容/传媒)",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 用户增长/收入季度兑现
    stocks: [
      { code: "sz300418", name: "昆仑万维", note: "天工大模型，AI搜索/音乐/游戏全布局" },
      { code: "sz300624", name: "万兴科技", note: "AI视频创意工具龙头，对标Adobe" },
      { code: "sh601360", name: "三六零", note: "360智脑，AI搜索+安全核心入口" },
      { code: "sz300364", name: "中文在线", note: "海量正版语料库，AI小说/短剧IP变现" },
      { code: "sz300058", name: "蓝色光标", note: "AI营销+虚拟人，Meta/微软合作伙伴" },
      { code: "sz300002", name: "神州泰岳", note: "NLP自然语言处理老牌，AI+游戏出海" },
      { code: "sz300781", name: "因赛集团", note: "AI视频生成营应用，InsightGPT" }
    ]
  },
  {
    name: "先进封装/HBM",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // ��单驱动，1-2季度
    stocks: [
      { code: "sz002156", name: "通富微电", note: "先进封装核心，深度绑定AMD" },
      { code: "sh600584", name: "长电科技", note: "国内封测龙头，具备Chiplet量产能力" },
      { code: "sz300475", name: "香农芯创", note: "HBM代理核心供应商" },
      { code: "sz301269", name: "华海诚科", note: "先进封装环氧塑封料国产化" },
      { code: "sh603005", name: "晶方科技", note: "传感器封测技术领先" }
    ]
  },
  {
    name: "人形机器人",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 产业化远期，量产需2-3年
    stocks: [
      { code: "sh601727", name: "上海电气", note: "并购重组+机器人，近期容量核心" },
      { code: "sh603009", name: "北特科技", note: "丝杠核心供应商，特斯拉产业链" },
      { code: "sh603728", name: "鸣志电器", note: "空心杯电机全球领先" },
      { code: "sh688017", name: "绿的谐波", note: "谐波减速器国产替代" },
      { code: "sh601689", name: "拓普集团", note: "执行器总成，绑定特斯拉" },
      { code: "sz002050", name: "三花智控", note: "热管理+机器人执行器" }
    ]
  },
  {
    name: "固态电池",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 产品周期，1-2季度
    stocks: [
      { code: "sz300750", name: "宁德时代", note: "动力电池全球龙头" },
      { code: "sh600206", name: "有研新材", note: "固态电池硫化物电解质龙头，近期核心" },
      { code: "sz002460", name: "赣锋锂业", note: "锂资源+固态电池布局" },
      { code: "sh688063", name: "派能科技", note: "户储龙头，固态电池研发" },
      { code: "sh603659", name: "璞泰来", note: "负极材料龙头，半固态技术" },
      { code: "sz002709", name: "天赐材料", note: "电解液龙头，新型锂盐" }
    ]
  },
  {
    name: "半导体设计",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 产品周期，1-2季度
    stocks: [
      { code: "sh603986", name: "兆易创新", note: "存储芯片+MCU，消费电子复苏" },
      { code: "sh603501", name: "韦尔股份", note: "CMOS传感器全球前三，汽车电子" },
      { code: "sz300661", name: "圣邦股份", note: "模拟芯片龙头，电源管理+信号链" },
      { code: "sz300782", name: "卓胜微", note: "射频芯片龙头，5G通信关键器件" },
      { code: "sh688008", name: "澜起科技", note: "内存接口芯片全球龙头，DDR5渗透" }
    ]
  },
  {
    name: "商业航天",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 航天合同制，长周期
    stocks: [
      { code: "sh601698", name: "中国卫通", note: "卫星运营国家队" },
      { code: "sh600118", name: "中国卫星", note: "卫星研制核心" },
      { code: "sz300762", name: "上海瀚讯", note: "军用宽带+千帆星座" },
      { code: "sz300045", name: "华力创通", note: "卫星通信芯片，手机直连" },
      { code: "sh600879", name: "航天电子", note: "航天电子设备与测控" }
    ]
  },
  {
    name: "信创软件",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 政策集采，季度兑现
    stocks: [
      { code: "sz000158", name: "常山北明", note: "鸿蒙核心龙头，华为生态深度绑定" },
      { code: "sz300339", name: "润和软件", note: "鸿蒙OS开发核心，OpenHarmony发起者" },
      { code: "sh600536", name: "中国软件", note: "操作系统国家队 (麒麟软件)" },
      { code: "sh688111", name: "金山办公", note: "国产办公软件龙头，AI+Office" },
      { code: "sz300598", name: "诚迈科技", note: "鸿蒙系统核心合作伙伴" },
      { code: "sz002180", name: "纳思达", note: "打印机芯片国产化" },
      { code: "sz002230", name: "科大讯飞", note: "智能语音+AI大模型" }
    ]
  },
  {
    name: "消费电子",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 产品发布周期
    stocks: [
      { code: "sz002475", name: "立讯精密", note: "果链龙头，代工iPhone/Vision Pro" },
      { code: "sz002241", name: "歌尔股份", note: "VR/AR+声学龙头" },
      { code: "sz002600", name: "领益智造", note: "精密结构件，AI手机受益" },
      { code: "sz300735", name: "光弘科技", note: "华为手机/汽车代工核心" },
      { code: "sz300433", name: "蓝思科技", note: "玻璃盖板龙头，苹果产业链" }
    ]
  },
  {
    name: "自动驾驶",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 销量/渗透率季度兑现
    stocks: [
      { code: "sh601127", name: "赛力斯", note: "华为智选车核心，问界大卖" },
      { code: "sh600418", name: "江淮汽车", note: "华为智选车合作伙伴 (尊界)" },
      { code: "sz300496", name: "中科创达", note: "智能座舱+OS系统" },
      { code: "sz002920", name: "德赛西威", note: "智能驾驶域控制器龙头" },
      { code: "sz002594", name: "比亚迪", note: "新能源汽车全球销冠" }
    ]
  },
  {
    name: "量子科技",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 纯研发周期
    stocks: [
      { code: "sh688027", name: "国盾量子", note: "量子通信国家队" },
      { code: "sz300520", name: "科大国创", note: "量子计算+数据智能" },
      { code: "sz000555", name: "神州信息", note: "金融量子通信网络" },
      { code: "sz000938", name: "紫光股份", note: "ICT基础设施，量子实验室" },
      { code: "sh600105", name: "永鼎股份", note: "量子通信相关产业布局" }
    ]
  },
  {
    name: "光伏储能",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 装机量/组件价格季度兑现
    stocks: [
      { code: "sz300274", name: "阳光电源", note: "光伏逆变器全球龙头" },
      { code: "sh601012", name: "隆基绿能", note: "单晶硅片组件龙头" },
      { code: "sh600438", name: "通威股份", note: "硅料+电池片双龙头" },
      { code: "sz300763", name: "锦浪科技", note: "组串式逆变器龙头" },
      { code: "sz300316", name: "晶盛机电", note: "光伏/半导体设备龙头" }
    ]
  },
  {
    name: "战略基建 (6G/磁浮)",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 政府基建预算周期
    stocks: [
      { code: "sh600941", name: "中国移动", note: "数字基建核心，6G+数据要素国家队" },
      { code: "sh600050", name: "中国联通", note: "算力网络主力，6G技术储备" },
      { code: "sh601728", name: "中国电信", note: "云网融合，国家云建设主力" },
      { code: "sh601766", name: "中国中车", note: "新一代高速磁浮，高端装备出海" },
      { code: "sh688187", name: "时代电气", note: "轨交电气系统核心，磁浮技术储备" },
      { code: "sh601800", name: "中国交建", note: "交通强国龙头，战略通道建设" },
      { code: "sh601668", name: "中国建筑", note: "基建绝对龙头，一带一路主力" },
      { code: "sz002465", name: "海格通信", note: "北斗导航+6G，空天信息网络" },
      { code: "sh688387", name: "信科移动", note: "6G标准制定参与者，星地融合" }
    ]
  },
  {
    name: "未来能源 (核聚变/氢能)",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 极远期技术，10年+周期
    stocks: [
      { code: "sh601985", name: "中国核电", note: "核能基建，可控核聚变前瞻布局" },
      { code: "sz003816", name: "中国广核", note: "核电运营双寡头，四代堆技术" },
      { code: "sh688122", name: "西部超导", note: "超导材料国家队，MRI/聚变核心" },
      { code: "sh600105", name: "永鼎股份", note: "高温超导带材，核聚变关键材料" },
      { code: "sh600363", name: "联创光电", note: "高温超导感应加热，聚变堆应用" },
      { code: "sh600875", name: "东方电气", note: "能源装备航母，核能+氢能全布局" },
      { code: "sh688339", name: "亿华通", note: "氢能燃料电池龙头，终极能源解决方案" },
      { code: "sz000338", name: "潍柴动力", note: "氢内燃机+燃料电池，重卡应用" },
      { code: "sz002366", name: "融发核电", note: "核电设备制造，人造太阳配套" }
    ]
  },
  {
    name: "国防军工 (海陆空天)",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 军费预算→合同→交付 2-5年
    stocks: [
      { code: "sh600760", name: "中航沈飞", note: "歼击机龙头，隐身战机核心" },
      { code: "sz000768", name: "中航西飞", note: "大飞机龙头，战略运输机" },
      { code: "sh600893", name: "航发动力", note: "航空发动机，工业皇冠明珠" },
      { code: "sh600150", name: "中国船舶", note: "海军装备核心，大周期共振" },
      { code: "sz000733", name: "振华科技", note: "军工电子元器件龙头，自主可控" },
      { code: "sh600372", name: "中航机载", note: "航空机电系统核心，资产整合" },
      { code: "sh600435", name: "北方导航", note: "制导控制系统，远程精确打击" },
      { code: "sh688297", name: "中无人机", note: "翼龙无人机，外贸拳头产品" },
      { code: "sz000547", name: "航天发展", note: "电子蓝军龙头，微系统+网络安全" }
    ]
  },
  {
    name: "稀土永磁 (战略资源)",
    transmissionSpeed: 'instant' as TransmissionSpeed,    // 稀土现货价格直接传导
    stocks: [
      { code: "sh600111", name: "北方稀土", note: "全球轻稀土龙头，定价权核心" },
      { code: "sz000831", name: "中国稀土", note: "中重稀土央企龙头，资源整合平台" },
      { code: "sz300748", name: "金力永磁", note: "高性能磁材，人形机器人核心" },
      { code: "sh600010", name: "包钢股份", note: "掌握全球最大稀土矿资源" },
      { code: "sz002371", name: "北方华创", note: "半导体设备平台龙头，规避制裁关键" },
      { code: "sz301269", name: "华大九天", note: "EDA软件龙头，芯片设计之母" },
      { code: "sh688256", name: "寒武纪", note: "国产AI芯片，算力自主可控" },
      { code: "sh688126", name: "沪硅产业", note: "大硅片国产替代，半导体材料安全" },
      { code: "sz000063", name: "中兴通讯", note: "ICT基础设施，核心芯片自研" }
    ]
  },
  {
    name: "自主可控 (芯片/信创)",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 政策集采+替代加速
    stocks: [
      { code: "sh688981", name: "中��国际", note: "晶圆代工国产化核心，先进制程突破" },
      { code: "sz000066", name: "中国长城", note: "飞腾CPU+自主可控老牌龙头" },
      { code: "sz002049", name: "紫光国微", note: "特种集成电路，国防信息化核心" },
      { code: "sh688041", name: "海光信息", note: "X86架构CPU，服务器芯片国产化" },
      { code: "sh688047", name: "龙芯中科", note: "自主指令集LoongArch，信创底座" },
      { code: "sz002371", name: "北方华创", note: "半导体设备平台龙头，规避制裁关键" },
      { code: "sz301269", name: "华大九天", note: "EDA软件龙头，芯片设计之母" },
      { code: "sh688256", name: "寒武纪", note: "国产AI芯片，算力自主可控" },
      { code: "sh688126", name: "沪硅产业", note: "大硅片国产替代，半导体材料安全" },
      { code: "sz000063", name: "中兴通讯", note: "ICT基础设施，核心芯片自研" }
    ]
  },
  {
    name: "脑机接口",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 纯研发前沿
    stocks: [
      { code: "sz301293", name: "三博脑科", note: "脑科医疗服务，脑机接口临床应用" },
      { code: "sh600775", name: "南京熊猫", note: "脑机接口研发，国资老牌科技" },
      { code: "sz002173", name: "创新医疗", note: "参股脑机接口公司，医疗康复" },
      { code: "sz300793", name: "佳禾智能", note: "脑电波监测专利，智能穿戴" },
      { code: "sh688114", name: "华大智造", note: "生命科学仪器，基因测序与脑科学" }
    ]
  },
  {
    name: "合成生物",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 产业化早期
    stocks: [
      { code: "sh688065", name: "凯赛生物", note: "生物基聚酰胺龙头，合成生物领军" },
      { code: "sh688639", name: "华恒生物", note: "氨基酸生物制造龙头，全球领先" },
      { code: "sh688363", name: "华熙生物", note: "透明质酸全产业链，生物活性物" },
      { code: "sh600873", name: "梅花生物", note: "氨基酸大宗品龙头，成本优势" },
      { code: "sz300401", name: "花园生物", note: "维生素D3全产业链，合成生物工艺" }
    ]
  },
  {
    name: "房地产/大基建",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 政策→销售1-2季度传导
    stocks: [
      { code: "sz000002", name: "万科A", note: "地产龙头，政策博弈核心" },
      { code: "sh600048", name: "保利发展", note: "央企地产龙头" },
      { code: "sh601155", name: "新城控股", note: "民企地产代表" },
      { code: "sz000069", name: "华侨城A", note: "文旅地产" },
      { code: "sh600185", name: "格力地产", note: "免税重组预期，地产转型" },
      { code: "sz002244", name: "滨江集团", note: "杭州亚运，优质民企" },
      { code: "sh600176", name: "中国巨石", note: "玻纤智造全球龙头，建材核心资产" }
    ]
  },
  {
    name: "大消费 (白酒/免税)",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 消费数据季度兑现
    stocks: [
      { code: "sh600519", name: "贵州茅台", note: "A股股王，核心资产定价锚" },
      { code: "sz000858", name: "五粮液", note: "白酒二哥，深市权重" },
      { code: "sh601888", name: "中国中免", note: "免税龙头，消费回流核心" },
      { code: "sz000568", name: "泸州老窖", note: "高端白酒" },
      { code: "sh600600", name: "青岛啤酒", note: "啤酒龙头，体育赛事预期" },
      { code: "sz002557", name: "洽洽食品", note: "零食龙头，防御性资产" }
    ]
  },
  {
    name: "有色/贵金属",
    transmissionSpeed: 'instant' as TransmissionSpeed,    // 现货价格即时传导
    stocks: [
      { code: "sh601899", name: "紫金矿业", note: "铜金巨头，全球资源核心" },
      { code: "sh600547", name: "山东黄金", note: "避险资产，金价联动" },
      { code: "sh603993", name: "洛阳钼业", note: "钴铜龙头，新能源上游" },
      { code: "sz000060", name: "中金岭南", note: "铅锌龙头" },
      { code: "sh601168", name: "西部矿业", note: "西部资源开发" },
      { code: "sz000969", name: "东方钽业", note: "钽铌铍稀有金属龙头，高科技材料" }
    ]
  },
  {
    name: "工业母机/机器人",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 订单驱动
    stocks: [
      { code: "sz002611", name: "东方精工", note: "10天8板，机器人+英伟达，高标核心" }, // 归位
      { code: "sz300024", name: "机器人", note: "新松机器人，国产工业机器人鼻祖" },
      { code: "sz000410", name: "沈阳机床", note: "工业母机国家队" },
      { code: "sz002520", name: "日发精机", note: "高端数控机床" },
      { code: "sz300161", name: "华中数控", note: "数控系统国产替代" }
    ]
  },
  {
    name: "电力 (水火风核)",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 电价/用电量季度兑现，极端天气可加速
    stocks: [
      { code: "sh600900", name: "长江电力", note: "全球最大水电上市公司，现金流之王+高股息" },
      { code: "sh600011", name: "华能国际", note: "火电装机龙头，煤电联动+新能源转型" },
      { code: "sh600795", name: "国电电力", note: "综合电力龙头，火电+风电+光伏全覆盖" },
      { code: "sh600886", name: "国投电力", note: "水电核心，控股雅砻江水电(全国第三大)" },
      { code: "sh600674", name: "川投能源", note: "参股雅砻江水电，四川水电龙头" },
      { code: "sh600027", name: "华电国际", note: "央企火电龙头，清洁能源转型加速" },
      { code: "sh600905", name: "三峡能源", note: "新能源发电龙头，风光装机规模第一梯队" },
      { code: "sz000027", name: "深圳能源", note: "地方电力龙头，火电+燃气+垃圾发电" },
      { code: "sh600025", name: "华能水电", note: "澜沧江水电开发，清洁能源纯正标的" },
      { code: "sz000543", name: "皖能电力", note: "安徽省电力龙头，火电+新能源双轮驱动" }
    ]
  },
  {
    name: "算电协同 (AI电力)",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 数据中心Capex+电力需求1-2季度传导
    stocks: [
      { code: "sz002335", name: "科华数据", note: "数据中心+UPS电源龙头，算电协同最纯标的" },
      { code: "sz002837", name: "英维克", note: "数据中心精密温控+液冷散热，AI算力热管理核心" },
      { code: "sh600405", name: "动力源", note: "电力电子+数据中心电源模块，算力基建供电" },
      { code: "sz300712", name: "永福股份", note: "电力设计+光储+算力电站一体化" },
      { code: "sz002851", name: "麦格米特", note: "数据中心电源解决方案，智能电源模块龙头" },
      { code: "sz300491", name: "通合科技", note: "数据中心UPS+充电桩电源，算力供电核心" },
      { code: "sz000400", name: "许继电气", note: "特高压+智能电网，算力园区配电核心" },
      { code: "sz002339", name: "积成电子", note: "电力自动化+能源互联网，数字能源管理" },
      { code: "sz002063", name: "远光软件", note: "电力信息化龙头，区块链+能源大数据" },
      { code: "sh603559", name: "中通国脉", note: "通信+电力协同建设，算力网络配套" }
    ]
  },
  {
    name: "煤炭",
    transmissionSpeed: 'instant' as TransmissionSpeed,    // 煤价→坑口利润即时传导
    stocks: [
      { code: "sh601088", name: "中国神华", note: "煤炭绝对龙头，煤电路港一体化+高股息之王" },
      { code: "sh601898", name: "中煤能源", note: "央企煤炭第二极，煤化工协同" },
      { code: "sh600188", name: "兖矿能源", note: "澳洲煤矿资源，全球化布局弹性最大" },
      { code: "sh601225", name: "陕西煤业", note: "陕北优质动力煤，成本最低+高分红" },
      { code: "sh601666", name: "平煤股份", note: "焦煤龙头，钢铁产业链上游" },
      { code: "sh600985", name: "淮北矿业", note: "焦煤+煤化工，安徽煤炭龙头" },
      { code: "sh600546", name: "山煤国际", note: "煤炭贸易+自有矿，山西煤企弹性标的" },
      { code: "sh601001", name: "大同煤业", note: "动力煤核心，晋能控股旗下" }
    ]
  },
  {
    name: "航运/造船",
    transmissionSpeed: 'instant' as TransmissionSpeed,    // BDI运价→运费收入即时传导
    stocks: [
      { code: "sh601919", name: "中远海控", note: "集运全球龙头，运价弹性之王" },
      { code: "sh601872", name: "招商轮船", note: "油轮+干散货双龙头，央企整合预期" },
      { code: "sh600150", name: "中国船舶", note: "造船龙头，军民融合+全球造船大周期" },
      { code: "sh601890", name: "亚星锚链", note: "船用锚链全球龙头，造船周期核心配套" },
      { code: "sh600685", name: "中船防务", note: "军用舰船+民用船舶，南船核心" },
      { code: "sh603308", name: "应流股份", note: "船用核心铸件，高端装备关键零部件" },
      { code: "sz002608", name: "江苏国信", note: "航运+金融，江苏国资整合" },
      { code: "sh601880", name: "大连港", note: "东北航运枢纽，港口核心资产" }
    ]
  },
  {
    name: "钢铁",
    transmissionSpeed: 'instant' as TransmissionSpeed,    // 螺纹钢/热卷现货价→吨钢毛利即时传导
    stocks: [
      { code: "sh600019", name: "宝钢股份", note: "钢铁绝对龙头，汽车板+硅钢全球领先" },
      { code: "sz000898", name: "鞍钢股份", note: "央企钢铁双雄，东北振兴+军工用钢" },
      { code: "sh600010", name: "包钢股份", note: "稀土钢双概念，资源+钢铁共振" },
      { code: "sz000708", name: "中信特钢", note: "特钢龙头，高端制造核心材料" },
      { code: "sz000825", name: "太钢不锈", note: "不锈钢龙头，手撕钢等高端品种" },
      { code: "sh600282", name: "南钢股份", note: "中厚板龙头，复星系+数字化钢厂" },
      { code: "sh600507", name: "方大特钢", note: "弹簧扁钢龙头，高分红小钢企" }
    ]
  },
  {
    name: "化工",
    transmissionSpeed: 'instant' as TransmissionSpeed,    // MDI/PX/PTA等大宗化工品价差即时兑现
    stocks: [
      { code: "sh600309", name: "万华化学", note: "MDI全球龙头，化工白马之王" },
      { code: "sh600346", name: "恒力石化", note: "PX-PTA-聚酯全产业链龙头" },
      { code: "sz002493", name: "荣盛石化", note: "炼化一体化+浙石化，大炼化核心" },
      { code: "sz000830", name: "鲁西化工", note: "煤化工+氟化工，山东化工龙头" },
      { code: "sh600989", name: "宝丰能源", note: "煤制烯烃龙头，成本优势极强" },
      { code: "sz002648", name: "卫星化学", note: "丙烯酸+乙烷裂解，C2/C3双龙头" },
      { code: "sh600352", name: "浙江龙盛", note: "分散染料全球龙头，间苯二胺垄断" },
      { code: "sz000301", name: "东方盛虹", note: "炼化+新能源材料，EVA光伏胶膜料" }
    ]
  },
  {
    name: "数据要素",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 政策→数据资产入表→收入1-2季度传导
    stocks: [
      { code: "sz000555", name: "神州信息", note: "金融数据服务龙头，数据要素核心标的" },
      { code: "sz300766", name: "每日互动", note: "数据智能龙头，个推+公共数据运营" },
      { code: "sz300229", name: "拓尔思", note: "非结构化数据处理龙头，AI+数据要素" },
      { code: "sh603232", name: "格尔软件", note: "数据安全+电子认证，数据确权基础设施" },
      { code: "sz300188", name: "美亚柏科", note: "电子数据取证龙头，公共数据治理" },
      { code: "sz300542", name: "新晨科技", note: "银行IT+数据中台，数据资产化" },
      { code: "sh603881", name: "数据港", note: "IDC数据中心龙头，阿里核心供应商" },
      { code: "sz002230", name: "科大讯飞", note: "AI数据标注+教育数据，多维数据资产" }
    ]
  },
  {
    name: "游戏/电竞",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 版号→产品上线→流水季度兑现
    stocks: [
      { code: "sz002555", name: "三七互娱", note: "游戏出海龙头，AI+小游戏双轮驱动" },
      { code: "sz002624", name: "完美世界", note: "端游+手游全品类，IP储备深厚" },
      { code: "sh603444", name: "吉比特", note: "研发型精品游戏，高ROE+高分红" },
      { code: "sz002174", name: "游族网络", note: "卡牌/SLG游戏出海，AI美术降本" },
      { code: "sz002517", name: "恺英网络", note: "传奇IP+小游戏，国内买量效率高" },
      { code: "sz002558", name: "巨人网络", note: "征途IP+AI游戏，史玉柱回归" },
      { code: "sz300745", name: "盛天网络", note: "电竞+网吧生态，云游戏入口" },
      { code: "sz002605", name: "姚记科技", note: "小游戏+流量平台，互联网新贵" }
    ]
  },
  {
    name: "农业/种业",
    transmissionSpeed: 'annual' as TransmissionSpeed,     // 种植周期+政策审批，1-3年兑现
    stocks: [
      { code: "sz000998", name: "隆平高科", note: "杂交水稻+转基因玉米种子龙头" },
      { code: "sz002385", name: "大北农", note: "转基因性状龙头，生猪养殖+种业双主业" },
      { code: "sh600598", name: "北大荒", note: "耕地资源稀缺龙头，1296万亩黑土地" },
      { code: "sz300087", name: "荃银高科", note: "先正达旗下，转基因水稻+玉米" },
      { code: "sh600354", name: "敦煌种业", note: "玉米种子+酒泉基地，甘肃种业龙头" },
      { code: "sh600359", name: "新农开发", note: "新疆棉花+番茄，兵团农业核心" },
      { code: "sz002714", name: "牧原股份", note: "生猪养殖绝对龙头，猪周期风向标" },
      { code: "sz300498", name: "温氏股份", note: "养殖巨头，猪+鸡双主业" }
    ]
  },
  {
    name: "中药",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 集采免疫+消费属性，季度兑现
    stocks: [
      { code: "sh600436", name: "片仔癀", note: "中药绝对龙头，国家绝密配方+提价权" },
      { code: "sz000538", name: "云南白药", note: "中药消费品龙头，牙膏+药品双引擎" },
      { code: "sh600085", name: "同仁堂", note: "百年老字号，安宫牛黄丸提价周期" },
      { code: "sz000423", name: "东阿阿胶", note: "阿胶垄断龙头，消费升级+提价逻辑" },
      { code: "sh600332", name: "白云山", note: "凉茶+中药，广药集团核心平台" },
      { code: "sz000999", name: "华润三九", note: "OTC中药龙头，999感冒灵+配方颗粒" },
      { code: "sh600750", name: "江中药业", note: "OTC消化类龙头，健胃消食片" },
      { code: "sz300957", name: "贝泰妮", note: "功效性护肤+中药成分，薇诺娜品牌" }
    ]
  },
  {
    name: "医药/创新药",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 管线进展/销售数据季度兑现
    stocks: [
      { code: "sh600276", name: "恒瑞医药", note: "创新药绝对龙头，管线最深最广" },
      { code: "sz300760", name: "迈瑞医疗", note: "医疗器械全球龙头，监护仪+超声+IVD" },
      { code: "sh688180", name: "君实生物", note: "PD-1+ADC管线，创新药出海标杆" },
      { code: "sh688235", name: "百济神州", note: "BTK抑制剂全球销冠，国际化最成功" },
      { code: "sz300347", name: "泰格医药", note: "CRO/CDMO龙头，临床试验核心" },
      { code: "sh603259", name: "药明康德", note: "CXO全产业链龙头，全球研发外包" },
      { code: "sz300759", name: "康龙化成", note: "CRO龙头，药物发现到临床全流程" },
      { code: "sh688185", name: "康希诺", note: "疫苗创新龙头，mRNA平台+吸入式" },
      { code: "sz300558", name: "贝达药业", note: "肺癌靶向药龙头，国产创新药先驱" },
      { code: "sh600196", name: "复星医药", note: "医药综合平台，创新药+器械+疫苗" }
    ]
  },
  {
    name: "网络安全",
    transmissionSpeed: 'quarterly' as TransmissionSpeed,  // 政策集采+地缘催化，季度兑现
    stocks: [
      { code: "sz300454", name: "深信服", note: "网络安全+云计算双龙头，零信任架构" },
      { code: "sh688561", name: "奇安信", note: "央企网安龙头，冬奥安保+关基保护" },
      { code: "sz300369", name: "绿盟科技", note: "入侵检测龙头，攻防演练核心" },
      { code: "sz3002439", name: "启明星辰", note: "安全网关+态势感知，国资入主" },
      { code: "sz300311", name: "任子行", note: "网络审计+安全管理，等保2.0受益" },
      { code: "sz3002268", name: "卫士通", note: "密码龙头，中国电科旗下，量子密码" },
      { code: "sz300352", name: "北信源", note: "终端安全龙头，信创安全核心" },
      { code: "sh688023", name: "安恒信息", note: "云安全+数据安全，新兴安全领军" }
    ]
  },
  {
    name: "油气/能源安全",
    transmissionSpeed: 'instant' as TransmissionSpeed,    // 油价→利润 即时传导
    stocks: [
      { code: "sh601857", name: "中国石油", note: "油气开采绝对龙头，PB修复+高股息" },
      { code: "sh600028", name: "中国石化", note: "炼化一体化龙头，成品油定价权" },
      { code: "sh600938", name: "中海油服", note: "海上油服龙头，深水勘探核心" },
      { code: "sh601808", name: "中海油", note: "海上油气开采，高股息+资源壁垒" },
      { code: "sh600583", name: "海油工程", note: "海洋工程总包龙头，LNG装备" },
      { code: "sz002353", name: "杰瑞股份", note: "页岩油压裂设备龙头，海外订单爆发" },
      { code: "sz002828", name: "贝肯能源", note: "油气钻完井服务，新疆+中东布局" },
      { code: "sh603727", name: "博迈科", note: "LNG模块化制造龙头，卡塔尔大单" },
      { code: "sz300164", name: "通源石油", note: "射孔器材+油田增产服务" },
      { code: "sh600339", name: "中油工程", note: "油气工程EPC龙头，一带一路主力" }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════
// V64.0: Transmission Speed Lookup
// ═══════════════════════════════════════════════════════════════════
const _speedCache: Record<string, TransmissionSpeed> = {};
PRESET_THEMES.forEach(t => { _speedCache[t.name] = t.transmissionSpeed; });

/**
 * 根据板块名称获取利好传导速度
 * 未知板块默认 'quarterly' (中性)
 */
export const getTransmissionSpeed = (concept?: string): TransmissionSpeed => {
  if (!concept) return 'quarterly';
  return _speedCache[concept] || 'quarterly';
};

/**
 * V64.0: 事件驱动模式检测
 * 跨板块扫描：如果 instant 板块集体异动而 annual 板块集体反向，
 * 判定为"事件驱动分化"模式，触发传导时滞修正。
 * 
 * 返回:
 *   mode: 'NONE' | 'GEO_EVENT' | 'POLICY_SHOCK' | 'COMMODITY_SURGE'
 *   instantAvg: instant板块平均涨跌
 *   annualAvg:  annual板块平均涨跌
 *   divergence: 分化度 (instantAvg - annualAvg)
 */
export interface EventDrivenDetection {
  mode: 'NONE' | 'GEO_EVENT' | 'POLICY_SHOCK' | 'COMMODITY_SURGE';
  instantAvg: number;
  annualAvg: number;
  quarterlyAvg: number;
  divergence: number;
  description: string;
}

export const detectEventDrivenMode = (
  stocks: { concept?: string; changePercent?: number }[]
): EventDrivenDetection => {
  const buckets: Record<TransmissionSpeed, number[]> = {
    instant: [],
    quarterly: [],
    annual: [],
  };

  stocks.forEach(s => {
    if (s.changePercent === undefined || s.changePercent === 0) return;
    const speed = getTransmissionSpeed(s.concept);
    buckets[speed].push(s.changePercent);
  });

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const instantAvg = avg(buckets.instant);
  const annualAvg = avg(buckets.annual);
  const quarterlyAvg = avg(buckets.quarterly);
  const divergence = instantAvg - annualAvg;

  // 判定条件：instant板块平均涨幅 > 2% 且 annual板块平均跌幅 < -0.5%
  // 且分化度 > 3个百分点 → 确认事件驱动模式
  if (divergence > 3 && instantAvg > 2 && annualAvg < -0.5) {
    // 进一步区分事件类型
    const oilStocks = stocks.filter(s => s.concept === '油气/能源安全');
    const oilAvg = avg(oilStocks.map(s => s.changePercent || 0));
    const goldStocks = stocks.filter(s => s.concept === '有色/贵金属');
    const goldAvg = avg(goldStocks.map(s => s.changePercent || 0));

    let mode: EventDrivenDetection['mode'] = 'GEO_EVENT';
    let description = '';

    if (oilAvg > 3 && goldAvg > 2) {
      mode = 'GEO_EVENT';
      description = `地缘事件驱动 | 油气+${oilAvg.toFixed(1)}% 黄金+${goldAvg.toFixed(1)}% vs 军工等${annualAvg.toFixed(1)}% | 分化${divergence.toFixed(1)}pct`;
    } else if (oilAvg > 4 && goldAvg < 1) {
      mode = 'COMMODITY_SURGE';
      description = `大宗商品脉冲 | 油气+${oilAvg.toFixed(1)}% 但避险未联动 | 分化${divergence.toFixed(1)}pct`;
    } else {
      mode = 'POLICY_SHOCK';
      description = `政策冲击分化 | instant板块+${instantAvg.toFixed(1)}% annual板块${annualAvg.toFixed(1)}% | 分化${divergence.toFixed(1)}pct`;
    }

    return { mode, instantAvg, annualAvg, quarterlyAvg, divergence, description };
  }

  // 反向检测：annual板块暴涨但instant不动 → 政策/军费预算事件
  if (annualAvg > 3 && instantAvg < 1 && (annualAvg - instantAvg) > 2.5) {
    return {
      mode: 'POLICY_SHOCK',
      instantAvg, annualAvg, quarterlyAvg,
      divergence: annualAvg - instantAvg,
      description: `政策预期驱动 | 长周期板块+${annualAvg.toFixed(1)}% (可能为军费/科技预算利好)`,
    };
  }

  return { mode: 'NONE', instantAvg, annualAvg, quarterlyAvg, divergence, description: '' };
};

// Helper to generate Stock objects
export const getPresetStocks = (): Stock[] => {
    const stocks: Stock[] = [];
    PRESET_THEMES.forEach(theme => {
        theme.stocks.forEach(s => {
            let role: any = 'Leader';
            let marketVal = 100; // Default small/mid cap
            
            // Auto-assign roles based on characteristics
            if (theme.name.includes('中军') || s.note?.includes('中军') || s.note?.includes('大容量') || s.note?.includes('千亿') || theme.name.includes('大金融')) {
                role = 'Main';
                marketVal = 500; // >300亿 trigger for "Core Index"
            }
            else if (s.note?.includes('连板') || s.note?.includes('高标')) {
                role = 'Dragon';
                if (s.note?.includes('首板')) role = 'Leader'; 
            }
            else if (s.note?.includes('老妖') || s.note?.includes('反抽')) {
                role = 'Independent';
            }
            else if (s.note?.includes('跟风') || s.note?.includes('套利')) {
                role = 'Follower';
            }

            stocks.push({
                id: s.code,
                code: s.code,
                name: s.name,
                concept: theme.name,
                role: role,
                status: 'Watch',
                marketValue: marketVal,
                notes: `【AI算法推荐】${s.note || theme.name + '核心龙头'}`,
                currentPrice: 0,
                changePercent: 0,
                prevClose: 0,
                open: 0,
                high: 0,
                low: 0,
                volume: 0,
                isLimitUp: false,
                lastUpdate: '',
            });
        });
    });
    return stocks;
};