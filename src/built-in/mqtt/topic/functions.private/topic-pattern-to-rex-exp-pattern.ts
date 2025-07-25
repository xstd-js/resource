// https://www.hivemq.com/blog/mqtt-essentials-part-5-mqtt-topics-best-practices/

export function topicPatternToRexExpPattern(topicPattern: string): string {
  return (
    '^' +
    topicPattern
      // escape special chars
      .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      // MQTT Wildcard – Single Level: +
      .replace(/(^|\\\/)\\\+($|\\\/)/g, (_, start: string, end: string): string => {
        return `${start}([^\\/]+)${end}`;
      })
      // MQTT Wildcard – Multi Level: #
      .replace(/(^|\/)#$/g, (_, start: string): string => {
        return `${start}(.+)`;
      }) +
    '$'
  );
}
