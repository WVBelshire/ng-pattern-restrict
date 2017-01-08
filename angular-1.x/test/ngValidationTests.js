var TestPage = require('./pageObjects/validationTestPage');
var testIf = require('./testFramework/testIf');

describe('Focus', function() {
  var page = null;
  beforeEach(function() {
    page = new TestPage();
    page.open('test/pages/ngValidation.html');    
  });

  it('should leave input always in a valid state', function() {
    //valid input
    page.setText('abc');
    expect(page.getValidStatusPromise()).toBe("true");

    //invalid input
    page.setText('def');
    expect(page.getValidStatusPromise()).toBe("true");
  });
}); // End: Focus