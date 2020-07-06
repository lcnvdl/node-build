const XmlHelper = require("../src/file-editors/helpers/xml.helper");
const { expect } = require("chai");

describe("XmlHelper", () => {
    describe("normalizeEmptyTags", () => {
        it("ignore tag", () => {
            const content = "<i></i><br></br>";
            const expected = "<i></i><br/>";
            const result = XmlHelper.generateSelfClosingTags(content, ["i"]);

            expect(result).to.equal(expected);
        });

        it("nested tags", () => {
            const content = "<i><br></br></i>";
            const expected = "<i><br/></i>";
            const result = XmlHelper.generateSelfClosingTags(content, ["i"]);

            expect(result).to.equal(expected);
        });

        it("nested with ignore", () => {
            const content =
                '        <plugin name="cordova-plugin-googleplus" spec="8.5.0">\n' +
                '            <variable name="REVERSED_CLIENT_ID" value="com.ionic.app"></variable>\n' +
                '            <variable name="WEB_APPLICATION_CLIENT_ID" value="123123123-aaaaaaaaaaaaaaajupgo.apps.googleusercontent.com"></variable>\n' +
                '        </plugin>\n';
            const expected = 
            '        <plugin name="cordova-plugin-googleplus" spec="8.5.0">\n' +
            '            <variable name="REVERSED_CLIENT_ID" value="com.ionic.app"></variable>\n' +
            '            <variable name="WEB_APPLICATION_CLIENT_ID" value="123123123-aaaaaaaaaaaaaaajupgo.apps.googleusercontent.com"></variable>\n' +
            '        </plugin>\n';
            const result = XmlHelper.generateSelfClosingTags(content, ["variable"]);

            expect(result).to.equal(expected);
        });

        it("single tag with attributes", () => {
            const content = "<my-property id='123'></my-property>";
            const expected = "<my-property id='123'/>";
            const result = XmlHelper.generateSelfClosingTags(content, ["i"]);

            expect(result).to.equal(expected);
        });
    });
});