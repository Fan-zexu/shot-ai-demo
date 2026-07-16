import type { PublicApiError } from './types.ts';

interface ErrorCopy {
  title: string;
  action: string;
}

const ERROR_COPY: Record<string, ErrorCopy> = {
  USER_BODY_OUT_OF_FRAME: {
    title: '人物没有保持全身入镜',
    action: '固定手机并确保头和脚完整可见后重拍',
  },
  USER_NOT_SIDE_VIEW: {
    title: '拍摄角度不是投篮手侧面',
    action: '将手机移到投篮手一侧重拍',
  },
  HAND_MISMATCH: {
    title: '用户投篮手与模板不一致',
    action: '选择同手模板或更换用户视频',
  },
  LOW_POSE_CONFIDENCE: {
    title: '关键身体部位识别不稳定',
    action: '改善光线、清晰度和遮挡后重拍',
  },
  INCOMPLETE_ACTION: {
    title: '没有识别到一次完整投篮',
    action: '保留准备动作到随挥结束后重拍',
  },
  ABNORMAL_VIDEO_TIMING: {
    title: '视频时间轴无法连续解析',
    action: '更换为时间戳连续、没有倒放或动作中间硬切的视频',
  },
  INSUFFICIENT_COMPARABLE_REGIONS: {
    title: '用户与模板缺少足够的共同可比较区域',
    action: '更换角度更规范的视频或模板',
  },
  LOW_ALIGNMENT_CONFIDENCE: {
    title: '用户动作与模板无法可靠对齐',
    action: '更换拍摄角度和动作范围更接近的用户视频或模板',
  },
  MULTIPLE_ACTIONS_DETECTED: {
    title: '视频中包含多次投篮',
    action: '只保留一次完整投篮后重新上传',
  },
  AMBIGUOUS_PERSON_TRACK: {
    title: '画面中人物追踪不稳定',
    action: '确保投篮者清晰且没有人物交叉遮挡',
  },
  UNSTABLE_CAMERA: {
    title: '拍摄过程中手机移动、旋转或变焦',
    action: '固定手机并保持画面不动后重拍',
  },
  VIDEO_NOT_DECODABLE: {
    title: '视频文件无法读取',
    action: '重新导出为 MP4、MOV 或 WebM 后上传',
  },
  WORKER_UNAVAILABLE: {
    title: '动作分析服务暂时不可用',
    action: '稍后重试',
  },
  PROCESSING_TIMEOUT: {
    title: '视频处理超时',
    action: '重试；重复超时则查看调试信息',
  },
};

export function errorCopy(error: Pick<PublicApiError, 'code' | 'message'> | null) {
  if (!error) return null;
  return (
    ERROR_COPY[error.code] ?? {
      title: error.message || '处理没有完成',
      action: '查看技术信息后重试；如果持续失败，请更换输入文件',
    }
  );
}
