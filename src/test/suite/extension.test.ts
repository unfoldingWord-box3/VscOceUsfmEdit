import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { findEdit, useEdit } from '../../usfmEditor';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});


	test( "Edit tests.", () => {
		const testOptions = [
			{
				before: "This is a string that will have an edit",
				after: "This is a string that has an edit",
				expectedReport: {
					start: 22,
					end: 31,
					newText: "has"
				}
			},{
				before: "",
				after: "a",
				expectedReport: {
					start: 0,
					end: 0,
					newText: "a"
				}
			},{
				before: "a",
				after: "",
				expectedReport: {
					start: 0,
					end: 1,
					newText: ""
				}
			},{
				before: "This is a removal",
				after: "This is removal",
				expectedReport:{
					start: 8,
					end: 10,
					newText: ""
				}
			},{
				before: "This is cat",
				after: "This is a cat",
				expectedReport:{
					start: 8,
					end: 8,
					newText: "a "
				}
			},{
				before: "This is cat",
				after: "This is s cat",
				expectedReport:{
					start: 8,
					end: 8,
					newText: "s "
				}
			},{
				before: "This is a cat",
				after: "This is a cool cat",
				expectedReport:{
					start: 11,
					end: 11,
					newText: "ool c"
				}
			},{
				before: "",
				after: "",
				expectedReport: {
					start: 0,
					end: 0,
					newText: ""
				}
			},{
				before: "bob",
				after: "bob",
				expectedReport: {
					start: 3,
					end: 3,
					newText: ""
				}
			},{
				before: "bob",
				after: "",
				expectedReport: {
					start: 0,
					end: 3,
					newText: ""
				}
			}
		];
		
		testOptions.forEach(testOption => {
			const actualReport = findEdit( testOption.before, testOption.after );
			assert.strictEqual( actualReport.start, testOption.expectedReport.start, "Start of edit is off." );
			assert.strictEqual( actualReport.end, testOption.expectedReport.end, "End of edit is off." );
			assert.strictEqual( actualReport.newText, testOption.expectedReport.newText, "New text is off." );

			const actualEdit = useEdit( testOption.before, actualReport );
			assert.strictEqual( actualEdit, testOption.after, "Edit is off." );
		});

	});
});
