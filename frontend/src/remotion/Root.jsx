import React from "react";
import { Composition } from "remotion";
import LessonVideoComposition, { getLessonDurationInFrames } from "./LessonVideoComposition";

export const RemotionRoot = () => {
  return (
    <Composition
      id="LessonVideo"
      component={LessonVideoComposition}
      width={1280}
      height={720}
      fps={30}
      durationInFrames={300}
      defaultProps={{
        lesson: {
          title: "Lesson",
          subject: "Topic",
          estimated_minutes: 1,
          slides: [],
        },
      }}
      calculateMetadata={({ props }) => {
        return {
          durationInFrames: getLessonDurationInFrames(props.lesson, 30),
        };
      }}
    />
  );
};
