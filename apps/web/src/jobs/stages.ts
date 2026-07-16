export interface DisplayStage {
  id: string;
  label: string;
  detail: string;
}

export const TEMPLATE_STAGES: DisplayStage[] = [
  { id: 'upload_received', label: '上传完成', detail: '原始文件已安全保存' },
  { id: 'validating_file', label: '基础文件检查', detail: '检查容器、时长和画面规格' },
  { id: 'extracting_pose', label: '提取姿态', detail: '逐帧识别全身关键点' },
  { id: 'validating_pose_quality', label: '记录质量提示', detail: '记录可见性与可比较区域' },
  { id: 'detecting_events', label: '识别动作事件', detail: '定位六个投篮动作事件' },
  { id: 'normalizing_motion', label: '归一化动作', detail: '建立与身材无关的动作坐标' },
  { id: 'writing_artifact', label: '生成模板', detail: '写入可复现的动作产物' },
  { id: 'ready', label: '可使用', detail: '模板动作产物已生成' },
];

export const COMPARISON_STAGES: DisplayStage[] = [
  { id: 'upload_received', label: '上传完成', detail: '用户视频已安全保存' },
  { id: 'validating_user', label: '记录质量提示', detail: '记录输入与拍摄条件' },
  { id: 'extracting_user_pose', label: '提取用户姿态', detail: '逐帧识别全身关键点' },
  { id: 'detecting_user_events', label: '识别用户动作事件', detail: '定位六个投篮动作事件' },
  { id: 'checking_compatibility', label: '检查模板兼容性', detail: '验证投篮手、视角与共同区域' },
  { id: 'aligning_phases', label: '对齐动作阶段', detail: '按事件锚点同步两段动作' },
  { id: 'computing_differences', label: '计算身体区域差异', detail: '汇总持续且可信的动作差异' },
  { id: 'generating_previews', label: '生成同步预览', detail: '编码同一时间轴的两段视频' },
  { id: 'building_report', label: '生成报告', detail: '封装三种视图的共享数据' },
  { id: 'ready', label: '可查看', detail: '报告已生成' },
];
