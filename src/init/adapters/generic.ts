/**
 * Generic fallback adapter.
 *
 * Used when no known framework is detected. Prints the JUnit XML format
 * that specdrive expects, so the user can wire it up manually.
 */
export const JUNIT_XML_SPEC = `
specdrive verify reads JUnit XML test reports. For each test, it looks for
RIDs in two places:

  1. <property> elements (preferred):

     <testcase name="test login">
       <properties>
         <property name="rid" value="RID-AUTH-LOGIN-001"/>
         <property name="rid" value="RID-AUTH-LOGIN-002"/>
       </properties>
     </testcase>

  2. Test name (fallback):

     <testcase name="test login @RID-AUTH-LOGIN-001"/>

Option 1 is more reliable. Most test frameworks support adding custom
properties to JUnit XML output. Check your framework's docs for how to
add custom <property> elements, or emit RIDs in test names as a fallback.
`.trim()
