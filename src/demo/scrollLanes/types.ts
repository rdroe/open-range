export type LaneId = 0 | 1 | 2 | 3 | 4

export type LaneElement = {
  id: string
  tag3: string
  startX: number
  endX: number
  height: number
  laneId: LaneId
}

export type LanePackResult = {
  items: { el: LaneElement; top: number }[]
  laneHeight: number
}

export type AllLanesLayout = {
  lanes: [LanePackResult, LanePackResult, LanePackResult, LanePackResult, LanePackResult]
}

export type MountScrollLanesDemoOptions = {
  embedded?: boolean
}
